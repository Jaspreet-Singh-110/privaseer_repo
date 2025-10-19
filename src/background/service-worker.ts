import { Storage } from './storage';
import { FirewallEngine } from './firewall-engine';
import { PrivacyScoreManager } from './privacy-score';
import { burnerEmailService } from './burner-email-service';
import type { MessagePayload, ConsentScanResult } from '../types';
import { logger } from '../utils/logger';
import { messageBus } from '../utils/message-bus';
import { tabManager } from '../utils/tab-manager';
import { backgroundEvents } from './event-emitter';
import { toError, isGetTrackerInfoData, isConsentScanResult } from '../utils/type-guards';
import { sanitizeUrl } from '../utils/sanitizer';
import { BADGE, TIME } from '../utils/constants';

let isInitialized = false;
let initializationPromise: Promise<void> | null = null;
const consentAlertCache = new Map<string, number>(); // Track consent alerts by domain

async function initializeExtension(): Promise<void> {
  // If already initialized, skip
  if (isInitialized) {
    return;
  }

  // If initialization is in progress, wait for it
  if (initializationPromise) {
    return initializationPromise;
  }

  // Start initialization
  initializationPromise = (async () => {
    try {

      // Initialize utilities first (logger auto-initializes on first use)
      await messageBus.initialize();
      await tabManager.initialize();

      // Initialize event-driven components (sets up event listeners)
      await PrivacyScoreManager.initialize();

      // Initialize core components
      await Storage.initialize();
      await FirewallEngine.initialize();
      await burnerEmailService.initialize();

      await chrome.action.setBadgeBackgroundColor({ color: BADGE.BACKGROUND_COLOR });

      setupMessageHandlers();
      setupTabEventHandlers();
      setupCleanupInterval();
      isInitialized = true;
    } catch (error) {
      logger.error('ServiceWorker', 'Extension initialization failed', toError(error));
      initializationPromise = null; // Reset on error so retry is possible
      throw error;
    }
  })();

  return initializationPromise;
}

function setupMessageHandlers(): void {
  messageBus.on('GET_STATE', async () => {
    const data = await Storage.getFresh();
    return { success: true, data };
  });

  messageBus.on('TOGGLE_PROTECTION', async () => {
    const enabled = await FirewallEngine.toggleProtection();
    return { success: true, enabled };
  });

  messageBus.on('CLEAR_ALERTS', async () => {
    await Storage.clearAlerts();
    return { success: true };
  });

  messageBus.on('GET_TRACKER_INFO', async (data: unknown) => {
    if (!isGetTrackerInfoData(data)) {
      return { success: false, error: 'Invalid data: domain not provided' };
    }
    const info = FirewallEngine.getTrackerInfo(data.domain);
    return { success: true, info };
  });

  messageBus.on('CONSENT_SCAN_RESULT', async (data: unknown) => {
    if (!isConsentScanResult(data)) {
      return { success: false, error: 'Invalid consent scan result data' };
    }
    const result = data;

    if (!result.isCompliant) {
      const urlObj = new URL(result.url);
      const domain = urlObj.hostname;

      // Check if we've already alerted about this domain recently (within 5 minutes)
      const lastAlertTime = consentAlertCache.get(domain);
      const now = Date.now();

      // If we've alerted within 5 minutes, skip
      if (lastAlertTime && now - lastAlertTime < 300000) {
        return { success: true };
      }

      // Also check if there's already a recent alert in storage
      const data = await Storage.get();
      const recentAlert = data.alerts.find(
        a => a.domain === domain &&
        a.message.includes('deceptive cookie banner') &&
        now - a.timestamp < 300000 // 5 minutes
      );

      if (recentAlert) {
        // Update cache to prevent future checks
        consentAlertCache.set(domain, now);
        return { success: true };
      }

      // Set cache BEFORE creating alert to prevent race conditions
      consentAlertCache.set(domain, now);

      // Emit non-compliant site event
      backgroundEvents.emit('NON_COMPLIANT_SITE', {
        domain,
        url: result.url,
        deceptivePatterns: result.deceptivePatterns || [],
      });

      await Storage.addAlert({
        id: `${Date.now()}-${Math.random()}`,
        type: 'non_compliant_site',
        severity: 'medium',
        message: `${domain} has deceptive cookie banner`,
        domain,
        timestamp: Date.now(),
        url: result.url,
        deceptivePatterns: result.deceptivePatterns || [],
      });

      messageBus.broadcast('STATE_UPDATE');
    }

    return { success: true };
  });

  messageBus.on('GENERATE_BURNER_EMAIL', async (data: unknown) => {
    try {
      logger.debug('ServiceWorker', 'GENERATE_BURNER_EMAIL handler called', { data });
      const { domain, url, label } = data as { domain: string; url?: string; label?: string };
      logger.debug('ServiceWorker', 'Calling burnerEmailService.generateEmail', { domain, url, label });
      const email = await burnerEmailService.generateEmail(domain, url, label);
      logger.debug('ServiceWorker', 'Email generated successfully', { email });
      return { success: true, email };
    } catch (error) {
      const err = toError(error);
      logger.error('ServiceWorker', 'Failed to generate burner email', err);
      return { success: false, error: err.message };
    }
  });

  messageBus.on('GET_BURNER_EMAILS', async () => {
    try {
      const emails = await burnerEmailService.getEmails();
      return { success: true, emails };
    } catch (error) {
      logger.error('ServiceWorker', 'Failed to fetch burner emails', toError(error));
      return { success: false, error: 'Failed to fetch burner emails' };
    }
  });

  messageBus.on('DELETE_BURNER_EMAIL', async (data: unknown) => {
    try {
      const { emailId } = data as { emailId: string };
      await burnerEmailService.deleteEmail(emailId);
      return { success: true };
    } catch (error) {
      logger.error('ServiceWorker', 'Failed to delete burner email', toError(error));
      return { success: false, error: 'Failed to delete burner email' };
    }
  });
}

function setupTabEventHandlers(): void {
  // Tab events are now handled by tabManager, but we still need to handle specific logic
  chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.status === 'loading' && tab.url && !tab.url.startsWith('chrome://')) {
      tabManager.resetBlockCount(tabId);
      await FirewallEngine.updateCurrentTabBadge(tabId);
    }

    if (changeInfo.status === 'complete' && tab.url && !tab.url.startsWith('chrome://')) {
      try {
        await FirewallEngine.checkPageForTrackers(tabId, tab.url);
      } catch (error) {
        logger.error('ServiceWorker', 'Error checking page', toError(error), { tabId, url: sanitizeUrl(tab.url) });
      }
    }
  });

  chrome.tabs.onActivated.addListener(async (activeInfo) => {
    try {
      await FirewallEngine.updateCurrentTabBadge(activeInfo.tabId);
    } catch (error) {
      logger.error('ServiceWorker', 'Error updating badge', toError(error), { tabId: activeInfo.tabId });
    }
  });

  // Listen for tab removal to clean up badge timers immediately
  messageBus.on('TAB_REMOVED', async (data: unknown) => {
    const tabId = (data as { tabId: number })?.tabId;
    if (typeof tabId === 'number') {
      FirewallEngine.clearTabTimer(tabId);
    }
  });
}

function setupCleanupInterval(): void {
  // Run cleanup every hour
  setInterval(() => {
    tabManager.cleanup();
    FirewallEngine.cleanup();
  }, TIME.ONE_HOUR_MS);
}

chrome.runtime.onInstalled.addListener(async () => {
  await initializeExtension();
});

chrome.runtime.onStartup.addListener(async () => {
  await initializeExtension();
});

chrome.declarativeNetRequest.onRuleMatchedDebug.addListener(async (details) => {
  if (details.request.tabId > 0) {
    await FirewallEngine.handleBlockedRequest(
      details.request.url,
      details.request.tabId
    );
  }
});

chrome.action.onClicked.addListener(() => {
  // Extension icon clicked - popup will open automatically
});

chrome.runtime.onSuspend.addListener(async () => {
  await Storage.ensureSaved();
});

// Initialize extension when service worker starts/wakes up
// This ensures proper initialization even after suspension
initializeExtension().catch(error => {
  logger.error('ServiceWorker', 'Initial startup failed', toError(error));
});

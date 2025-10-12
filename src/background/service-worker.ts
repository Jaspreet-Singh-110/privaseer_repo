import { Storage } from './storage';
import { FirewallEngine } from './firewall-engine';
import { PrivacyScoreManager } from './privacy-score';
import type { MessagePayload, ConsentScanResult } from '../types';
import { logger } from '../utils/logger';
import { messageBus } from '../utils/message-bus';
import { tabManager } from '../utils/tab-manager';
import { backgroundEvents } from './event-emitter';
import { toError, isGetTrackerInfoData, isConsentScanResult } from '../utils/type-guards';
import { sanitizeUrl } from '../utils/sanitizer';
import { BADGE, TIME } from '../utils/constants';

let isInitialized = false;
const consentAlertCache = new Map<string, number>(); // Track consent alerts by domain

async function initializeExtension(): Promise<void> {
  try {
    logger.info('ServiceWorker', 'Initializing extension...');

    // Initialize utilities first (logger auto-initializes on first use)
    await messageBus.initialize();
    await tabManager.initialize();

    // Initialize event-driven components (sets up event listeners)
    await PrivacyScoreManager.initialize();

    // Initialize core components
    await Storage.initialize();
    await FirewallEngine.initialize();

    await chrome.action.setBadgeBackgroundColor({ color: BADGE.BACKGROUND_COLOR });

    setupMessageHandlers();
    setupTabEventHandlers();
    setupCleanupInterval();
    isInitialized = true;

    logger.info('ServiceWorker', 'Extension initialized successfully');
  } catch (error) {
    logger.error('ServiceWorker', 'Extension initialization failed', toError(error));
    throw error;
  }
}

function setupMessageHandlers(): void {
  messageBus.on('GET_STATE', async () => {
    const data = await Storage.getFresh();
    return { success: true, data };
  });

  messageBus.on('TOGGLE_PROTECTION', async () => {
    const enabled = await FirewallEngine.toggleProtection();
    logger.debug('ServiceWorker', 'Toggle protection result', { enabled });
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
    logger.debug('ServiceWorker', 'Running periodic cleanup');
    tabManager.cleanup();
    FirewallEngine.cleanup();
  }, TIME.ONE_HOUR_MS);
}

chrome.runtime.onInstalled.addListener(async () => {
  logger.info('ServiceWorker', 'Extension installed');
  await initializeExtension();
});

chrome.runtime.onStartup.addListener(async () => {
  logger.info('ServiceWorker', 'Browser started');
  await initializeExtension();
});

chrome.declarativeNetRequest.onRuleMatchedDebug.addListener(async (details) => {
  logger.debug('ServiceWorker', 'Rule matched', { url: sanitizeUrl(details.request.url), tabId: details.request.tabId });

  if (details.request.tabId > 0) {
    await FirewallEngine.handleBlockedRequest(
      details.request.url,
      details.request.tabId
    );
  }
});

chrome.action.onClicked.addListener(() => {
  logger.debug('ServiceWorker', 'Extension icon clicked');
});

chrome.runtime.onSuspend.addListener(async () => {
  logger.info('ServiceWorker', 'Service worker suspending, flushing storage...');
  await Storage.ensureSaved();
  logger.info('ServiceWorker', 'Storage flushed before suspend');
});

logger.info('ServiceWorker', 'Service worker loaded');

// Initialize extension when service worker starts/wakes up
// This ensures proper initialization even after suspension
initializeExtension().catch(error => {
  logger.error('ServiceWorker', 'Initial startup failed', toError(error));
});

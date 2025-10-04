import { Storage } from './storage';
import { FirewallEngine } from './firewall-engine';
import { PrivacyScoreManager } from './privacy-score';
import { logger } from '../utils/logger';
import { messageBus } from '../utils/message-bus';
import { tabManager } from '../utils/tab-manager';
import type { MessagePayload, ConsentScanResult } from '../types';

async function initializeExtension(): Promise<void> {
  try {
    logger.info('ServiceWorker', 'Initializing extension...');

    await logger.initialize();
    await messageBus.initialize();
    await tabManager.initialize();
    await Storage.initialize();
    await FirewallEngine.initialize();

    await chrome.action.setBadgeBackgroundColor({ color: '#DC2626' });

    setupMessageHandlers();

    logger.info('ServiceWorker', 'Extension initialized successfully', {
      tabs: tabManager.getStats(),
    });

    messageBus.broadcast('EXTENSION_READY');
  } catch (error) {
    logger.error('ServiceWorker', 'Extension initialization failed', error);
    throw error;
  }
}

function setupMessageHandlers(): void {
  messageBus.on('GET_STATE', async () => {
    logger.debug('ServiceWorker', 'Getting extension state');
    const data = await Storage.get();
    return { success: true, data };
  });

  messageBus.on('TOGGLE_PROTECTION', async () => {
    logger.info('ServiceWorker', 'Toggling protection');
    const enabled = await FirewallEngine.toggleProtection();
    return { success: true, enabled };
  });

  messageBus.on('GET_TRACKER_INFO', async (data) => {
    const domain = data?.domain;
    if (!domain) {
      logger.warn('ServiceWorker', 'GET_TRACKER_INFO called without domain');
      return { success: false, error: 'Domain not provided' };
    }

    logger.debug('ServiceWorker', 'Getting tracker info', { domain });
    const info = FirewallEngine.getTrackerInfo(domain);
    return { success: true, info };
  });

  messageBus.on('CONSENT_SCAN_RESULT', async (data) => {
    const result = data as ConsentScanResult;

    logger.debug('ServiceWorker', 'Consent scan result received', {
      url: result.url,
      isCompliant: result.isCompliant,
    });

    if (!result.isCompliant) {
      await PrivacyScoreManager.handleNonCompliantSite();

      const urlObj = new URL(result.url);
      const domain = urlObj.hostname;

      await Storage.addAlert({
        id: `${Date.now()}-${Math.random()}`,
        type: 'non_compliant_site',
        severity: 'medium',
        message: `${domain} has deceptive cookie banner`,
        domain,
        timestamp: Date.now(),
        url: result.url,
      });

      logger.warn('ServiceWorker', 'Non-compliant cookie banner detected', {
        domain,
        patterns: result.deceptivePatterns,
      });

      messageBus.broadcast('STATE_UPDATE');
    }

    return { success: true };
  });
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
  logger.debug('ServiceWorker', 'Rule matched', {
    url: details.request.url,
    tabId: details.request.tabId,
  });

  if (details.request.tabId > 0) {
    await FirewallEngine.handleBlockedRequest(
      details.request.url,
      details.request.tabId
    );
  }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'loading' && tab.url && !tab.url.startsWith('chrome://')) {
    logger.debug('ServiceWorker', `Tab ${tabId} loading`, { url: tab.url });
    FirewallEngine.resetTabBlockCount(tabId);
    tabManager.resetBlockCount(tabId);
    await FirewallEngine.updateCurrentTabBadge(tabId);
  }

  if (changeInfo.status === 'complete' && tab.url && !tab.url.startsWith('chrome://')) {
    logger.debug('ServiceWorker', `Tab ${tabId} complete`, { url: tab.url });
    try {
      await FirewallEngine.checkPageForTrackers(tabId, tab.url);
    } catch (error) {
      logger.error('ServiceWorker', 'Error checking page', error, { tabId });
    }
  }
});

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  logger.debug('ServiceWorker', `Tab activated: ${activeInfo.tabId}`);
  try {
    await FirewallEngine.updateCurrentTabBadge(activeInfo.tabId);
  } catch (error) {
    logger.error('ServiceWorker', 'Error updating badge', error, {
      tabId: activeInfo.tabId,
    });
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  logger.debug('ServiceWorker', `Tab removed: ${tabId}`);
  FirewallEngine.resetTabBlockCount(tabId);
});

chrome.action.onClicked.addListener(() => {
  logger.debug('ServiceWorker', 'Extension icon clicked');
});

setInterval(() => {
  tabManager.cleanup();
}, 60 * 60 * 1000);

logger.info('ServiceWorker', 'Service worker loaded');

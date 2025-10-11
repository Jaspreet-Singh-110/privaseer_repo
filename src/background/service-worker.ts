import { Storage } from './storage';
import { FirewallEngine } from './firewall-engine';
import { PrivacyScoreManager } from './privacy-score';
import type { MessagePayload, ConsentScanResult } from '../types';
import { logger } from '../utils/logger';
import { messageBus } from '../utils/message-bus';
import { tabManager } from '../utils/tab-manager';

let isInitialized = false;

async function initializeExtension(): Promise<void> {
  try {
    logger.info('ServiceWorker', 'Initializing extension...');

    // Initialize utilities first
    await logger.initialize();
    await messageBus.initialize();
    await tabManager.initialize();

    // Initialize core components
    await Storage.initialize();
    await FirewallEngine.initialize();

    await chrome.action.setBadgeBackgroundColor({ color: '#DC2626' });

    setupMessageHandlers();
    setupTabEventHandlers();
    setupCleanupInterval();
    isInitialized = true;

    logger.info('ServiceWorker', 'Extension initialized successfully');
  } catch (error) {
    logger.error('ServiceWorker', 'Extension initialization failed', error as Error);
    throw error;
  }
}

function setupMessageHandlers(): void {
  messageBus.on('GET_STATE', async () => {
    const data = await Storage.get();
    return { success: true, data };
  });

  messageBus.on('TOGGLE_PROTECTION', async () => {
    const enabled = await FirewallEngine.toggleProtection();
    return { success: true, enabled };
  });

  messageBus.on('GET_TRACKER_INFO', async (data: any) => {
    const domain = data?.domain;
    if (!domain) {
      return { success: false, error: 'Domain not provided' };
    }
    const info = FirewallEngine.getTrackerInfo(domain);
    return { success: true, info };
  });

  messageBus.on('CONSENT_SCAN_RESULT', async (data: any) => {
    const result = data as ConsentScanResult;

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

      messageBus.broadcast('STATE_UPDATE');
    }

    return { success: true };
  });

  // Keep fallback for direct chrome.runtime.sendMessage calls
  chrome.runtime.onMessage.addListener((message: MessagePayload, sender, sendResponse) => {
    handleMessage(message, sender).then(sendResponse).catch(error => {
      logger.error('ServiceWorker', 'Message handler error', error as Error);
      sendResponse({ error: error.message });
    });
    return true;
  });
}

async function handleMessage(message: MessagePayload, sender: chrome.runtime.MessageSender): Promise<any> {
  try {
    // Check if extension is initialized
    if (!isInitialized) {
      logger.info('ServiceWorker', 'Extension not initialized yet, initializing...');
      await initializeExtension();
    }

    switch (message.type) {
      case 'GET_STATE': {
        const data = await Storage.get();
        return { success: true, data };
      }

      case 'TOGGLE_PROTECTION': {
        const enabled = await FirewallEngine.toggleProtection();
        return { success: true, enabled };
      }

      case 'GET_TRACKER_INFO': {
        const domain = message.data?.domain;
        if (!domain) {
          return { success: false, error: 'Domain not provided' };
        }
        const info = FirewallEngine.getTrackerInfo(domain);
        return { success: true, info };
      }

      case 'CONSENT_SCAN_RESULT': {
        const result = message.data as ConsentScanResult;

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

          messageBus.broadcast('STATE_UPDATE');
        }

        return { success: true };
      }

      default:
        return { success: false, error: 'Unknown message type' };
    }
  } catch (error) {
    logger.error('ServiceWorker', 'Error handling message', error as Error);
    throw error;
  }
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
        logger.error('ServiceWorker', 'Error checking page', error as Error, { tabId, url: tab.url });
      }
    }
  });

  chrome.tabs.onActivated.addListener(async (activeInfo) => {
    try {
      await FirewallEngine.updateCurrentTabBadge(activeInfo.tabId);
    } catch (error) {
      logger.error('ServiceWorker', 'Error updating badge', error as Error, { tabId: activeInfo.tabId });
    }
  });
}

function setupCleanupInterval(): void {
  // Run cleanup every hour
  setInterval(() => {
    logger.debug('ServiceWorker', 'Running periodic cleanup');
    tabManager.cleanup();
    FirewallEngine.cleanup();
  }, 60 * 60 * 1000);
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
  logger.debug('ServiceWorker', 'Rule matched', { url: details.request.url, tabId: details.request.tabId });

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

logger.info('ServiceWorker', 'Service worker loaded');

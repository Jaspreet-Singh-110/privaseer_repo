import { Storage } from './storage';
import { FirewallEngine } from './firewall-engine';
import { PrivacyScoreManager } from './privacy-score';
import type { MessagePayload, ConsentScanResult } from '../types';

let isInitialized = false;

async function initializeExtension(): Promise<void> {
  try {
    console.log('Privaseer: Initializing extension...');

    await Storage.initialize();
    await FirewallEngine.initialize();

    await chrome.action.setBadgeBackgroundColor({ color: '#DC2626' });

    setupMessageHandlers();
    isInitialized = true;

    console.log('Privaseer: Extension initialized successfully');
  } catch (error) {
    console.error('Privaseer: Extension initialization failed:', error);
    throw error;
  }
}

function setupMessageHandlers(): void {
  chrome.runtime.onMessage.addListener((message: MessagePayload, sender, sendResponse) => {
    handleMessage(message, sender).then(sendResponse).catch(error => {
      console.error('Privaseer: Message handler error:', error);
      sendResponse({ error: error.message });
    });
    return true;
  });
}

async function handleMessage(message: MessagePayload, sender: chrome.runtime.MessageSender): Promise<any> {
  try {
    // Check if extension is initialized
    if (!isInitialized) {
      console.log('Privaseer: Extension not initialized yet, initializing...');
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

          chrome.runtime.sendMessage({ type: 'STATE_UPDATE' }).catch(() => {});
        }

        return { success: true };
      }

      default:
        return { success: false, error: 'Unknown message type' };
    }
  } catch (error) {
    console.error('Privaseer: Error handling message:', error);
    throw error;
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  console.log('Privaseer: Extension installed');
  await initializeExtension();
});

chrome.runtime.onStartup.addListener(async () => {
  console.log('Privaseer: Browser started');
  await initializeExtension();
});

chrome.declarativeNetRequest.onRuleMatchedDebug.addListener(async (details) => {
  console.log('Privaseer: Rule matched:', details.request.url);

  if (details.request.tabId > 0) {
    await FirewallEngine.handleBlockedRequest(
      details.request.url,
      details.request.tabId
    );
  }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'loading' && tab.url && !tab.url.startsWith('chrome://')) {
    FirewallEngine.resetTabBlockCount(tabId);
    await FirewallEngine.updateCurrentTabBadge(tabId);
  }

  if (changeInfo.status === 'complete' && tab.url && !tab.url.startsWith('chrome://')) {
    try {
      await FirewallEngine.checkPageForTrackers(tabId, tab.url);
    } catch (error) {
      console.error('Privaseer: Error checking page:', error);
    }
  }
});

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    await FirewallEngine.updateCurrentTabBadge(activeInfo.tabId);
  } catch (error) {
    console.error('Privaseer: Error updating badge:', error);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  FirewallEngine.resetTabBlockCount(tabId);
});

chrome.action.onClicked.addListener(() => {
  console.log('Privaseer: Extension icon clicked');
});

console.log('Privaseer: Service worker loaded');

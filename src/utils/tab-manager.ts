import { logger } from './logger';
import { messageBus } from './message-bus';

interface TabInfo {
  id: number;
  url?: string;
  title?: string;
  active: boolean;
  blockCount: number;
  lastUpdate: number;
  status?: 'loading' | 'complete';
}

class TabManager {
  private tabs = new Map<number, TabInfo>();
  private activeTabId: number | null = null;
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    chrome.tabs.onCreated.addListener((tab) => this.handleTabCreated(tab));
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) =>
      this.handleTabUpdated(tabId, changeInfo, tab)
    );
    chrome.tabs.onActivated.addListener((activeInfo) =>
      this.handleTabActivated(activeInfo)
    );
    chrome.tabs.onRemoved.addListener((tabId) => this.handleTabRemoved(tabId));

    await this.syncExistingTabs();

    this.initialized = true;
    logger.info('TabManager', 'Tab manager initialized', {
      tabCount: this.tabs.size,
    });
  }

  private async syncExistingTabs(): Promise<void> {
    try {
      const tabs = await chrome.tabs.query({});
      for (const tab of tabs) {
        if (tab.id) {
          this.tabs.set(tab.id, {
            id: tab.id,
            url: tab.url,
            title: tab.title,
            active: tab.active,
            blockCount: 0,
            lastUpdate: Date.now(),
            status: tab.status as 'loading' | 'complete',
          });

          if (tab.active) {
            this.activeTabId = tab.id;
          }
        }
      }

      logger.info('TabManager', `Synced ${tabs.length} existing tabs`);
    } catch (error) {
      logger.error('TabManager', 'Failed to sync existing tabs', error);
    }
  }

  private handleTabCreated(tab: chrome.tabs.Tab): void {
    if (!tab.id) return;

    logger.debug('TabManager', `Tab created: ${tab.id}`, { url: tab.url });

    this.tabs.set(tab.id, {
      id: tab.id,
      url: tab.url,
      title: tab.title,
      active: tab.active,
      blockCount: 0,
      lastUpdate: Date.now(),
      status: tab.status as 'loading' | 'complete',
    });
  }

  private handleTabUpdated(
    tabId: number,
    changeInfo: chrome.tabs.TabChangeInfo,
    tab: chrome.tabs.Tab
  ): void {
    logger.debug('TabManager', `Tab updated: ${tabId}`, changeInfo);

    const existingTab = this.tabs.get(tabId);

    if (changeInfo.status === 'loading') {
      if (existingTab) {
        existingTab.blockCount = 0;
        existingTab.status = 'loading';
      }
    }

    if (existingTab) {
      Object.assign(existingTab, {
        url: tab.url || existingTab.url,
        title: tab.title || existingTab.title,
        status: tab.status as 'loading' | 'complete' || existingTab.status,
        lastUpdate: Date.now(),
      });
    } else {
      this.tabs.set(tabId, {
        id: tabId,
        url: tab.url,
        title: tab.title,
        active: tab.active,
        blockCount: 0,
        lastUpdate: Date.now(),
        status: tab.status as 'loading' | 'complete',
      });
    }

    messageBus.broadcast('TAB_UPDATED', {
      tabId,
      changeInfo,
      tab: this.tabs.get(tabId),
    });
  }

  private handleTabActivated(activeInfo: chrome.tabs.ActiveInfo): void {
    logger.debug('TabManager', `Tab activated: ${activeInfo.tabId}`);

    if (this.activeTabId !== null) {
      const previousTab = this.tabs.get(this.activeTabId);
      if (previousTab) {
        previousTab.active = false;
      }
    }

    this.activeTabId = activeInfo.tabId;

    const activeTab = this.tabs.get(activeInfo.tabId);
    if (activeTab) {
      activeTab.active = true;
      activeTab.lastUpdate = Date.now();
    }

    messageBus.broadcast('TAB_ACTIVATED', {
      tabId: activeInfo.tabId,
      tab: activeTab,
    });
  }

  private handleTabRemoved(tabId: number): void {
    logger.debug('TabManager', `Tab removed: ${tabId}`);

    this.tabs.delete(tabId);

    if (this.activeTabId === tabId) {
      this.activeTabId = null;
    }
  }

  getTab(tabId: number): TabInfo | undefined {
    return this.tabs.get(tabId);
  }

  getActiveTab(): TabInfo | undefined {
    return this.activeTabId !== null ? this.tabs.get(this.activeTabId) : undefined;
  }

  getAllTabs(): TabInfo[] {
    return Array.from(this.tabs.values());
  }

  incrementBlockCount(tabId: number): void {
    const tab = this.tabs.get(tabId);
    if (tab) {
      tab.blockCount++;
      tab.lastUpdate = Date.now();
      logger.debug('TabManager', `Block count incremented for tab ${tabId}`, {
        count: tab.blockCount,
      });
    }
  }

  resetBlockCount(tabId: number): void {
    const tab = this.tabs.get(tabId);
    if (tab) {
      tab.blockCount = 0;
      tab.lastUpdate = Date.now();
      logger.debug('TabManager', `Block count reset for tab ${tabId}`);
    }
  }

  getBlockCount(tabId: number): number {
    return this.tabs.get(tabId)?.blockCount || 0;
  }

  getStats(): {
    totalTabs: number;
    activeTabs: number;
    totalBlocks: number;
  } {
    const tabs = Array.from(this.tabs.values());
    return {
      totalTabs: tabs.length,
      activeTabs: tabs.filter(t => t.active).length,
      totalBlocks: tabs.reduce((sum, t) => sum + t.blockCount, 0),
    };
  }

  cleanup(): void {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    let removed = 0;

    for (const [tabId, tab] of this.tabs.entries()) {
      if (tab.lastUpdate < cutoff && !tab.active) {
        this.tabs.delete(tabId);
        removed++;
      }
    }

    if (removed > 0) {
      logger.info('TabManager', `Cleaned up ${removed} stale tabs`);
    }
  }
}

export const tabManager = new TabManager();

export type { TabInfo };

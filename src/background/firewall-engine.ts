import type { Alert, TrackerLists } from '../types';
import { Storage } from './storage';
import { PrivacyScoreManager } from './privacy-score';

export class FirewallEngine {
  private static trackerLists: TrackerLists | null = null;
  private static isInitialized = false;

  static async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      const response = await fetch(chrome.runtime.getURL('data/tracker-lists.json'));
      this.trackerLists = await response.json();
      this.isInitialized = true;

      console.log('Firewall engine initialized with', this.getAllTrackerDomains().length, 'tracker domains');
    } catch (error) {
      console.error('Failed to initialize firewall engine:', error);
      throw error;
    }
  }

  private static getAllTrackerDomains(): string[] {
    if (!this.trackerLists) return [];

    const allDomains: string[] = [];
    for (const category of Object.values(this.trackerLists.categories)) {
      allDomains.push(...category);
    }

    return [...new Set(allDomains)];
  }

  private static getTrackerCategory(domain: string): string {
    if (!this.trackerLists) return 'unknown';

    for (const [category, domains] of Object.entries(this.trackerLists.categories)) {
      if (domains.some(d => domain.includes(d))) {
        return category;
      }
    }

    return 'unknown';
  }

  private static isHighRisk(domain: string): boolean {
    if (!this.trackerLists) return false;
    return this.trackerLists.highRisk.some(d => domain.includes(d));
  }

  static async handleBlockedRequest(url: string, tabId: number): Promise<void> {
    try {
      const urlObj = new URL(url);
      const domain = urlObj.hostname;

      const category = this.getTrackerCategory(domain);
      const isHighRisk = this.isHighRisk(domain);

      await Storage.incrementTrackerBlock(domain, category, isHighRisk);

      await PrivacyScoreManager.handleTrackerBlocked();

      const tab = await chrome.tabs.get(tabId);
      const siteDomain = tab.url ? new URL(tab.url).hostname : 'unknown';

      const alert: Alert = {
        id: `${Date.now()}-${Math.random()}`,
        type: isHighRisk ? 'high_risk' : 'tracker_blocked',
        severity: isHighRisk ? 'high' : 'low',
        message: `Blocked ${domain}`,
        domain: siteDomain,
        timestamp: Date.now(),
        url: tab.url,
      };

      await Storage.addAlert(alert);

      this.notifyPopup();
    } catch (error) {
      console.error('Error handling blocked request:', error);
    }
  }

  static async checkPageForTrackers(tabId: number, url: string): Promise<void> {
    try {
      const data = await Storage.get();
      const currentTrackersCount = data.privacyScore.daily.trackersBlocked;

      const urlObj = new URL(url);
      const domain = urlObj.hostname;

      const hasTrackers = Object.keys(data.trackers).some(
        tracker => data.trackers[tracker].lastBlocked > Date.now() - 5000
      );

      if (!hasTrackers && currentTrackersCount === 0) {
        await PrivacyScoreManager.handleCleanSite();

        const alert: Alert = {
          id: `${Date.now()}-${Math.random()}`,
          type: 'tracker_blocked',
          severity: 'low',
          message: `${domain} has no trackers`,
          domain,
          timestamp: Date.now(),
          url,
        };

        await Storage.addAlert(alert);
        this.notifyPopup();
      }
    } catch (error) {
      console.error('Error checking page for trackers:', error);
    }
  }

  private static notifyPopup(): void {
    chrome.runtime.sendMessage({ type: 'STATE_UPDATE' }).catch(() => {
      // Popup might not be open
    });
  }

  static async toggleProtection(): Promise<boolean> {
    const enabled = await Storage.toggleProtection();

    if (enabled) {
      console.log('Protection enabled');
    } else {
      console.log('Protection paused');
    }

    return enabled;
  }
}

import type { Alert, TrackerLists } from '../types';
import { Storage } from './storage';
import { PrivacyScoreManager } from './privacy-score';

const RULESET_ID = 'tracker_blocklist';

export class FirewallEngine {
  private static trackerLists: TrackerLists | null = null;
  private static isInitialized = false;
  private static tabBlockCounts: Map<number, number> = new Map();

  static async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      const response = await fetch(chrome.runtime.getURL('data/tracker-lists.json'));
      this.trackerLists = await response.json();
      this.isInitialized = true;

      const data = await Storage.get();
      if (data.settings.protectionEnabled) {
        await this.enableBlocking();
      } else {
        await this.disableBlocking();
      }

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

      this.incrementTabBlockCount(tabId);
      await this.updateTabBadge(tabId);

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
      await this.enableBlocking();
      console.log('Protection enabled');
    } else {
      await this.disableBlocking();
      console.log('Protection paused');
    }

    return enabled;
  }

  private static async enableBlocking(): Promise<void> {
    try {
      await chrome.declarativeNetRequest.updateEnabledRulesets({
        enableRulesetIds: [RULESET_ID],
      });
      console.log('Blocking rules enabled');
    } catch (error) {
      console.error('Failed to enable blocking:', error);
    }
  }

  private static async disableBlocking(): Promise<void> {
    try {
      await chrome.declarativeNetRequest.updateEnabledRulesets({
        disableRulesetIds: [RULESET_ID],
      });
      console.log('Blocking rules disabled');
    } catch (error) {
      console.error('Failed to disable blocking:', error);
    }
  }

  private static incrementTabBlockCount(tabId: number): void {
    const currentCount = this.tabBlockCounts.get(tabId) || 0;
    this.tabBlockCounts.set(tabId, currentCount + 1);
  }

  static resetTabBlockCount(tabId: number): void {
    this.tabBlockCounts.set(tabId, 0);
  }

  private static async updateTabBadge(tabId: number): Promise<void> {
    try {
      const count = this.tabBlockCounts.get(tabId) || 0;
      const badgeText = count > 0 ? count.toString() : '';

      await chrome.action.setBadgeText({ text: badgeText, tabId });
      await chrome.action.setBadgeBackgroundColor({ color: '#DC2626', tabId });
    } catch (error) {
      console.error('Error updating tab badge:', error);
    }
  }

  static async updateCurrentTabBadge(tabId: number): Promise<void> {
    await this.updateTabBadge(tabId);
  }

  static getTrackerInfo(domain: string): { description: string; alternative: string } | null {
    if (!this.trackerLists) return null;

    const category = this.getTrackerCategory(domain);
    const isHighRisk = this.isHighRisk(domain);

    const trackerInfo: Record<string, { description: string; alternative: string }> = {
      'google-analytics.com': {
        description: 'Tracks user behavior and collects browsing data for website analytics',
        alternative: 'Use privacy-focused analytics like Plausible or Simple Analytics'
      },
      'googletagmanager.com': {
        description: 'Manages marketing tags and tracks user interactions across websites',
        alternative: 'Self-host analytics or use server-side tracking solutions'
      },
      'doubleclick.net': {
        description: 'Ad network that tracks users across websites for targeted advertising',
        alternative: 'Support websites directly or use contextual ads like EthicalAds'
      },
      'facebook.net': {
        description: 'Tracks user activity for Facebook advertising and social features',
        alternative: 'Use privacy-focused social media like Mastodon or direct website subscriptions'
      },
      'connect.facebook.net': {
        description: 'Facebook SDK that monitors user behavior for ad targeting',
        alternative: 'Websites can use native share buttons instead of Facebook integration'
      },
      'mixpanel.com': {
        description: 'Product analytics that tracks detailed user interactions and behavior',
        alternative: 'Use open-source alternatives like PostHog or Matomo'
      },
      'hotjar.com': {
        description: 'Records user sessions, heatmaps, and tracks on-page behavior',
        alternative: 'Use privacy-respecting alternatives like Microsoft Clarity with anonymization'
      },
      'segment.com': {
        description: 'Collects and routes user data to multiple analytics and marketing tools',
        alternative: 'Implement direct server-side tracking or use RudderStack'
      },
      'criteo.com': {
        description: 'Retargeting platform that follows users across websites to show ads',
        alternative: 'Support content creators directly through subscriptions or donations'
      },
      'fingerprintjs.com': {
        description: 'Creates unique browser fingerprints to identify users without cookies',
        alternative: 'Websites should use consent-based authentication instead'
      },
    };

    for (const [key, info] of Object.entries(trackerInfo)) {
      if (domain.includes(key)) {
        return info;
      }
    }

    const categoryDescriptions: Record<string, { description: string; alternative: string }> = {
      analytics: {
        description: 'Collects data about how users interact with websites',
        alternative: 'Use privacy-focused analytics like Plausible or Fathom'
      },
      advertising: {
        description: 'Tracks users across websites for targeted advertising',
        alternative: 'Support websites through direct subscriptions or contextual ads'
      },
      social: {
        description: 'Monitors user activity for social media platforms',
        alternative: 'Use native sharing features or privacy-focused social networks'
      },
      fingerprinting: {
        description: 'Identifies users by their unique browser characteristics',
        alternative: 'Clear browsing data regularly and use privacy-focused browsers'
      },
      beacons: {
        description: 'Tracks user behavior and conversions for advertisers',
        alternative: 'Support creators directly instead of relying on ad revenue'
      },
    };

    return categoryDescriptions[category] || {
      description: 'Tracking service that collects user data',
      alternative: 'Use privacy-focused alternatives or disable third-party tracking'
    };
  }
}

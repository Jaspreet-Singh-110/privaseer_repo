import type { Alert, TrackerLists } from '../types';
import { Storage } from './storage';
import { PrivacyScoreManager } from './privacy-score';
import { logger } from '../utils/logger';
import { messageBus } from '../utils/message-bus';
import { tabManager } from '../utils/tab-manager';

const RULESET_ID = 'tracker_blocklist';

export class FirewallEngine {
  private static trackerLists: TrackerLists | null = null;
  private static isInitialized = false;

  private static readonly RISK_WEIGHTS = {
    'analytics': 1,        // Basic analytics (Google Analytics, Matomo)
    'advertising': 2,      // Behavioral ads (DoubleClick, AdSense)
    'social': 2,           // Social tracking (Facebook Pixel, Twitter Analytics)
    'fingerprinting': 5,   // Device fingerprinting (FingerprintJS, CreepJS)
    'beacons': 2,          // Tracking beacons (conversion tracking)
    'cryptomining': 10,    // Malicious crypto mining
    'malware': 20,         // Known malicious domains
    'unknown': 1           // Default for unclassified trackers
  };

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

      const domainCount = this.getAllTrackerDomains().length;
      logger.info('FirewallEngine', 'Firewall engine initialized', { trackerDomains: domainCount });
    } catch (error) {
      logger.error('FirewallEngine', 'Failed to initialize firewall engine', error as Error);
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

  private static getRiskWeight(domain: string, category: string): number {
    // Check for known malicious/high-risk domains first
    const knownMalicious = ['coinhive', 'cryptoloot', 'coin-hive'];
    if (knownMalicious.some(m => domain.includes(m))) {
      return this.RISK_WEIGHTS['cryptomining'];
    }

    // Check for fingerprinting services
    const fingerprintingServices = ['fingerprintjs', 'creepjs', 'canvas', 'clientjs'];
    if (fingerprintingServices.some(f => domain.includes(f)) || category === 'fingerprinting') {
      return this.RISK_WEIGHTS['fingerprinting'];
    }

    // Use category-based weight
    return this.RISK_WEIGHTS[category as keyof typeof this.RISK_WEIGHTS] || this.RISK_WEIGHTS['unknown'];
  }

  static async handleBlockedRequest(url: string, tabId: number): Promise<void> {
    try {
      const urlObj = new URL(url);
      const domain = urlObj.hostname;

      const category = this.getTrackerCategory(domain);
      const isHighRisk = this.isHighRisk(domain);
      const riskWeight = this.getRiskWeight(domain, category);

      await Storage.incrementTrackerBlock(domain, category, isHighRisk);

      // Use weighted scoring based on tracker risk level
      // Pass domain to enable 24-hour cooldown tracking
      await PrivacyScoreManager.handleTrackerBlocked(domain, riskWeight);

      tabManager.incrementBlockCount(tabId);
      await this.updateTabBadge(tabId);

      const tab = await chrome.tabs.get(tabId);
      const siteDomain = tab.url ? new URL(tab.url).hostname : 'unknown';

      // Adjust alert severity based on risk weight
      const getSeverity = (): 'low' | 'medium' | 'high' => {
        if (riskWeight >= 10) return 'high';
        if (riskWeight >= 5) return 'high';
        if (riskWeight >= 2) return 'medium';
        return 'low';
      };

      const getAlertType = (): 'tracker_blocked' | 'high_risk' | 'non_compliant_site' => {
        if (riskWeight >= 10) return 'high_risk';
        if (isHighRisk) return 'high_risk';
        return 'tracker_blocked';
      };

      const alert: Alert = {
        id: `${Date.now()}-${Math.random()}`,
        type: getAlertType(),
        severity: getSeverity(),
        message: `Blocked ${domain}${riskWeight > 1 ? ` (${category}, risk: ${riskWeight}x)` : ''}`,
        domain: siteDomain,
        timestamp: Date.now(),
        url: tab.url,
      };

      await Storage.addAlert(alert);

      logger.debug('FirewallEngine', 'Blocked tracker', { 
        tracker: domain, 
        category, 
        riskWeight, 
        tabId, 
        site: siteDomain 
      });

      this.notifyPopup();
    } catch (error) {
      logger.error('FirewallEngine', 'Error handling blocked request', error as Error, { url, tabId });
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
        logger.debug('FirewallEngine', 'Clean site detected', { domain, tabId });
        this.notifyPopup();
      }
    } catch (error) {
      logger.error('FirewallEngine', 'Error checking page for trackers', error as Error, { tabId, url });
    }
  }

  private static notifyPopup(): void {
    messageBus.broadcast('STATE_UPDATE');
  }

  static async toggleProtection(): Promise<boolean> {
    const enabled = await Storage.toggleProtection();

    if (enabled) {
      await this.enableBlocking();
      logger.info('FirewallEngine', 'Protection enabled');
    } else {
      await this.disableBlocking();
      logger.info('FirewallEngine', 'Protection paused');
    }

    return enabled;
  }

  private static async enableBlocking(): Promise<void> {
    try {
      await chrome.declarativeNetRequest.updateEnabledRulesets({
        enableRulesetIds: [RULESET_ID],
      });
      logger.info('FirewallEngine', 'Blocking rules enabled');
    } catch (error) {
      logger.error('FirewallEngine', 'Failed to enable blocking', error as Error);
    }
  }

  private static async disableBlocking(): Promise<void> {
    try {
      await chrome.declarativeNetRequest.updateEnabledRulesets({
        disableRulesetIds: [RULESET_ID],
      });
      logger.info('FirewallEngine', 'Blocking rules disabled');
    } catch (error) {
      logger.error('FirewallEngine', 'Failed to disable blocking', error as Error);
    }
  }

  private static async updateTabBadge(tabId: number): Promise<void> {
    try {
      const count = tabManager.getBlockCount(tabId);
      const badgeText = count > 0 ? count.toString() : '';

      await chrome.action.setBadgeText({ text: badgeText, tabId });
      await chrome.action.setBadgeBackgroundColor({ color: '#DC2626', tabId });
    } catch (error) {
      logger.error('FirewallEngine', 'Error updating tab badge', error as Error, { tabId });
    }
  }

  static async updateCurrentTabBadge(tabId: number): Promise<void> {
    await this.updateTabBadge(tabId);
  }

  static cleanup(): void {
    logger.debug('FirewallEngine', 'Running cleanup');
    // Cleanup is now handled by tabManager, but we can add any engine-specific cleanup here
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

import type { Alert, TrackerLists } from '../types';
import { Storage } from './storage';
import { logger } from '../utils/logger';
import { messageBus } from '../utils/message-bus';
import { tabManager } from '../utils/tab-manager';
import { backgroundEvents } from './event-emitter';
import { toError } from '../utils/type-guards';
import { sanitizeUrl } from '../utils/sanitizer';
import { BADGE } from '../utils/constants';

const RULESET_ID = 'tracker_blocklist';
const BADGE_UPDATE_DEBOUNCE_MS = 300;

export class FirewallEngine {
  private static trackerLists: TrackerLists | null = null;
  private static isInitialized = false;
  private static badgeUpdateTimers = new Map<number, NodeJS.Timeout>();
  private static cleanSiteAlerts = new Map<string, number>(); // Track clean site alerts by domain

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
      logger.error('FirewallEngine', 'Failed to initialize firewall engine', toError(error));
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

      // Emit event for Storage to increment tracker count
      backgroundEvents.emit('TRACKER_INCREMENT', {
        domain,
        category,
        isHighRisk,
      });

      // Emit event for PrivacyScoreManager to handle scoring
      backgroundEvents.emit('TRACKER_BLOCKED', {
        domain,
        category,
        isHighRisk,
        riskWeight,
        tabId,
        url,
      });

      tabManager.incrementBlockCount(tabId);
      this.scheduleTabBadgeUpdate(tabId);

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
        url: sanitizeUrl(tab.url),
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
      logger.error('FirewallEngine', 'Error handling blocked request', toError(error), { url: sanitizeUrl(url), tabId });
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
        // Check if we've already alerted about this domain recently (within 1 minute)
        const lastAlertTime = this.cleanSiteAlerts.get(domain);
        const now = Date.now();

        if (!lastAlertTime || now - lastAlertTime > 60000) {
          this.cleanSiteAlerts.set(domain, now);

          // Emit clean site detected event
          backgroundEvents.emit('CLEAN_SITE_DETECTED', {
            domain,
            tabId,
            url,
          });

          const alert: Alert = {
            id: `${Date.now()}-${Math.random()}`,
            type: 'tracker_blocked',
            severity: 'low',
            message: `${domain} has no trackers`,
            domain,
            timestamp: Date.now(),
            url: sanitizeUrl(url),
          };

          await Storage.addAlert(alert);
          logger.debug('FirewallEngine', 'Clean site detected', { domain, tabId });
          this.notifyPopup();
        }
      }
    } catch (error) {
      logger.error('FirewallEngine', 'Error checking page for trackers', toError(error), { tabId, url: sanitizeUrl(url) });
    }
  }

  private static notifyPopup(): void {
    messageBus.broadcast('STATE_UPDATE');
  }

  static async toggleProtection(): Promise<boolean> {
    const enabled = await Storage.toggleProtection();

    if (enabled) {
      await this.enableBlocking();
      // Update badge for current active tab
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs[0]?.id) {
        await this.updateCurrentTabBadge(tabs[0].id);
      }
      logger.info('FirewallEngine', 'Protection enabled');
    } else {
      await this.disableBlocking();
      // Clear all badges when protection is disabled
      await chrome.action.setBadgeText({ text: '' });
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
      logger.error('FirewallEngine', 'Failed to enable blocking', toError(error));
    }
  }

  private static async disableBlocking(): Promise<void> {
    try {
      await chrome.declarativeNetRequest.updateEnabledRulesets({
        disableRulesetIds: [RULESET_ID],
      });
      logger.info('FirewallEngine', 'Blocking rules disabled');
    } catch (error) {
      logger.error('FirewallEngine', 'Failed to disable blocking', toError(error));
    }
  }

  private static async updateTabBadgeImmediate(tabId: number): Promise<void> {
    try {
      const count = tabManager.getBlockCount(tabId);
      const badgeText = count > 0 ? count.toString() : '';

      await chrome.action.setBadgeText({ text: badgeText, tabId });
      await chrome.action.setBadgeBackgroundColor({ color: BADGE.BACKGROUND_COLOR, tabId });
    } catch (error) {
      logger.error('FirewallEngine', 'Error updating tab badge', toError(error), { tabId });
    }
  }

  private static scheduleTabBadgeUpdate(tabId: number): void {
    // Clear any existing timer for this tab
    const existingTimer = this.badgeUpdateTimers.get(tabId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Schedule a new update after the debounce delay
    const timer = setTimeout(() => {
      this.updateTabBadgeImmediate(tabId);
      this.badgeUpdateTimers.delete(tabId);
    }, BADGE_UPDATE_DEBOUNCE_MS);

    this.badgeUpdateTimers.set(tabId, timer);
  }

  static async updateCurrentTabBadge(tabId: number): Promise<void> {
    await this.updateTabBadgeImmediate(tabId);
  }

  static clearTabTimer(tabId: number): void {
    const timer = this.badgeUpdateTimers.get(tabId);
    if (timer) {
      clearTimeout(timer);
      this.badgeUpdateTimers.delete(tabId);
      logger.debug('FirewallEngine', 'Cleared badge timer for closed tab', { tabId });
    }
  }

  static cleanup(): void {
    logger.debug('FirewallEngine', 'Running cleanup');
    
    // Clear all pending badge update timers to prevent memory leaks
    for (const timer of this.badgeUpdateTimers.values()) {
      clearTimeout(timer);
    }
    this.badgeUpdateTimers.clear();
    
    logger.debug('FirewallEngine', 'Cleared badge update timers', { 
      timersCleared: this.badgeUpdateTimers.size 
    });
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

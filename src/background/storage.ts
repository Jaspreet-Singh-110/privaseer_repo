import type { StorageData, PrivacyScore, Alert, TrackerData } from '../types';
import { logger } from '../utils/logger';

const DEFAULT_STORAGE_DATA: StorageData = {
  privacyScore: {
    current: 100,
    daily: {
      trackersBlocked: 0,
      cleanSitesVisited: 0,
      nonCompliantSites: 0,
    },
    history: [],
  },
  alerts: [],
  trackers: {},
  settings: {
    protectionEnabled: true,
    showNotifications: true,
  },
  lastReset: Date.now(),
};

export class Storage {
  private static cache: StorageData | null = null;

  static async initialize(): Promise<void> {
    try {
      const data = await chrome.storage.local.get('privacyData');

      if (!data.privacyData) {
        await this.save(DEFAULT_STORAGE_DATA);
        this.cache = DEFAULT_STORAGE_DATA;
        logger.info('Storage', 'Initialized with default data');
      } else {
        this.cache = data.privacyData;
        await this.checkDailyReset();
        logger.info('Storage', 'Loaded existing data');
      }
    } catch (error) {
      logger.error('Storage', 'Storage initialization failed', error as Error);
      this.cache = DEFAULT_STORAGE_DATA;
    }
  }

  static async get(): Promise<StorageData> {
    if (!this.cache) {
      await this.initialize();
    }
    return this.cache!;
  }

  static async save(data: StorageData): Promise<void> {
    try {
      await chrome.storage.local.set({ privacyData: data });
      this.cache = data;
      logger.debug('Storage', 'Data saved successfully');
    } catch (error) {
      logger.error('Storage', 'Storage save failed', error as Error);
      throw error;
    }
  }

  static async updateScore(newScore: number): Promise<void> {
    const data = await this.get();
    data.privacyScore.current = Math.max(0, Math.min(100, newScore));
    await this.save(data);
  }

  static async addAlert(alert: Alert): Promise<void> {
    const data = await this.get();
    data.alerts.unshift(alert);

    if (data.alerts.length > 100) {
      data.alerts = data.alerts.slice(0, 100);
    }

    await this.save(data);
  }

  static async incrementTrackerBlock(domain: string, category: string, isHighRisk: boolean): Promise<void> {
    const data = await this.get();

    if (!data.trackers[domain]) {
      data.trackers[domain] = {
        domain,
        category,
        isHighRisk,
        blockedCount: 0,
        lastBlocked: Date.now(),
      };
    }

    data.trackers[domain].blockedCount++;
    data.trackers[domain].lastBlocked = Date.now();
    data.privacyScore.daily.trackersBlocked++;

    await this.save(data);
  }

  static async recordCleanSite(): Promise<void> {
    const data = await this.get();
    data.privacyScore.daily.cleanSitesVisited++;
    await this.save(data);
  }

  static async recordNonCompliantSite(): Promise<void> {
    const data = await this.get();
    data.privacyScore.daily.nonCompliantSites++;
    await this.save(data);
  }

  static async toggleProtection(): Promise<boolean> {
    const data = await this.get();
    data.settings.protectionEnabled = !data.settings.protectionEnabled;
    await this.save(data);
    return data.settings.protectionEnabled;
  }

  private static async checkDailyReset(): Promise<void> {
    const data = await this.get();
    const now = Date.now();
    const lastReset = data.lastReset;
    const oneDayMs = 24 * 60 * 60 * 1000;

    if (now - lastReset >= oneDayMs) {
      const historyEntry = {
        date: new Date(lastReset).toISOString().split('T')[0],
        score: data.privacyScore.current,
        trackersBlocked: data.privacyScore.daily.trackersBlocked,
      };

      data.privacyScore.history.unshift(historyEntry);

      if (data.privacyScore.history.length > 30) {
        data.privacyScore.history = data.privacyScore.history.slice(0, 30);
      }

      // Daily Recovery Mechanism: Reward clean browsing days
      // If user had a good day (fewer than 10 trackers), give +1 recovery point
      // This encourages long-term engagement and allows recovery from bad days
      const hadCleanDay = data.privacyScore.daily.trackersBlocked < 10;
      const hadVeryCleanDay = data.privacyScore.daily.trackersBlocked < 5;

      if (hadVeryCleanDay) {
        // Very clean day: +2 recovery points
        data.privacyScore.current = Math.min(100, data.privacyScore.current + 2);
      } else if (hadCleanDay) {
        // Clean day: +1 recovery point
        data.privacyScore.current = Math.min(100, data.privacyScore.current + 1);
      }

      // Reset daily counters
      data.privacyScore.daily = {
        trackersBlocked: 0,
        cleanSitesVisited: 0,
        nonCompliantSites: 0,
      };
      data.lastReset = now;

      await this.save(data);
    }
  }

  static async clear(): Promise<void> {
    await chrome.storage.local.clear();
    this.cache = null;
    await this.initialize();
  }
}

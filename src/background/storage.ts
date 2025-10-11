import type { StorageData, PrivacyScore, Alert, TrackerData } from '../types';
import { logger } from '../utils/logger';
import { backgroundEvents } from './event-emitter';
import { toError } from '../utils/type-guards';
import { TIME, DAILY_RECOVERY, STORAGE_RETRY } from '../utils/constants';

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
  private static listenersSetup = false;
  private static isDirty = false;
  private static saveTimer: NodeJS.Timeout | null = null;
  private static isSaving = false;
  private static readonly SAVE_DELAY = 500; // ms

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

      // Setup event listeners once
      if (!this.listenersSetup) {
        this.setupEventListeners();
        this.listenersSetup = true;
      }
    } catch (error) {
      logger.error('Storage', 'Storage initialization failed', toError(error));
      this.cache = DEFAULT_STORAGE_DATA;
    }
  }

  private static setupEventListeners(): void {
    // Listen to tracker blocked events
    backgroundEvents.on('TRACKER_INCREMENT', async (data) => {
      await this.incrementTrackerBlock(data.domain, data.category, data.isHighRisk);
    });

    // Listen to score updates
    backgroundEvents.on('SCORE_UPDATED', async (data) => {
      await this.updateScore(data.newScore);
    });

    logger.debug('Storage', 'Event listeners setup complete');
  }

  static async get(): Promise<StorageData> {
    if (!this.cache) {
      await this.initialize();
    }
    return this.cache!;
  }

  static async save(data: StorageData): Promise<void> {
    await this.saveWithRetry(data);
  }

  private static async saveWithRetry(data: StorageData, attempt: number = 1): Promise<void> {
    try {
      await chrome.storage.local.set({ privacyData: data });
      this.cache = data;
      
      if (attempt > 1) {
        logger.info('Storage', `Data saved successfully after ${attempt} attempts`);
      } else {
        logger.debug('Storage', 'Data saved successfully');
      }
    } catch (error) {
      const err = toError(error);
      
      if (attempt < STORAGE_RETRY.MAX_ATTEMPTS) {
        const delay = STORAGE_RETRY.INITIAL_DELAY_MS * Math.pow(STORAGE_RETRY.BACKOFF_MULTIPLIER, attempt - 1);
        logger.warn('Storage', `Storage save failed (attempt ${attempt}/${STORAGE_RETRY.MAX_ATTEMPTS}), retrying in ${delay}ms`, err);
        
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.saveWithRetry(data, attempt + 1);
      } else {
        logger.error('Storage', `Storage save failed after ${STORAGE_RETRY.MAX_ATTEMPTS} attempts`, err);
        throw error;
      }
    }
  }

  private static scheduleSave(): void {
    this.isDirty = true;
    
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }
    
    this.saveTimer = setTimeout(() => this.flushToDisk(), this.SAVE_DELAY);
  }

  private static async flushToDisk(): Promise<void> {
    if (!this.isDirty || this.isSaving || !this.cache) return;
    
    this.isSaving = true;
    this.isDirty = false;
    
    try {
      await this.saveWithRetry(this.cache);
      logger.debug('Storage', 'Data flushed to disk');
    } catch (error) {
      logger.error('Storage', 'Storage flush failed', toError(error));
      this.isDirty = true; // Retry on next operation
    } finally {
      this.isSaving = false;
    }
  }

  static async ensureSaved(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    await this.flushToDisk();
  }

  static async updateScore(newScore: number): Promise<void> {
    const data = await this.get();
    data.privacyScore.current = Math.max(0, Math.min(100, newScore));
    // Critical operation: save immediately to prevent data loss
    await this.save(data);
  }

  static async addAlert(alert: Alert): Promise<void> {
    const data = await this.get();
    data.alerts.unshift(alert);

    if (data.alerts.length > 100) {
      data.alerts = data.alerts.slice(0, 100);
    }

    this.scheduleSave();
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

    this.scheduleSave();
  }

  static async recordCleanSite(): Promise<void> {
    const data = await this.get();
    data.privacyScore.daily.cleanSitesVisited++;
    this.scheduleSave();
  }

  static async recordNonCompliantSite(): Promise<void> {
    const data = await this.get();
    data.privacyScore.daily.nonCompliantSites++;
    this.scheduleSave();
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

    if (now - lastReset >= TIME.ONE_DAY_MS) {
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
      // If user had a good day (fewer than threshold trackers), give recovery points
      // This encourages long-term engagement and allows recovery from bad days
      const hadCleanDay = data.privacyScore.daily.trackersBlocked < DAILY_RECOVERY.CLEAN_DAY_THRESHOLD;
      const hadVeryCleanDay = data.privacyScore.daily.trackersBlocked < DAILY_RECOVERY.VERY_CLEAN_DAY_THRESHOLD;

      if (hadVeryCleanDay) {
        // Very clean day: reward points
        data.privacyScore.current = Math.min(100, data.privacyScore.current + DAILY_RECOVERY.VERY_CLEAN_DAY_REWARD);
      } else if (hadCleanDay) {
        // Clean day: reward points
        data.privacyScore.current = Math.min(100, data.privacyScore.current + DAILY_RECOVERY.CLEAN_DAY_REWARD);
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

import { Storage } from './storage';
import { logger } from '../utils/logger';
import { backgroundEvents } from './event-emitter';
import { toError } from '../utils/type-guards';
import { BADGE, TIME, PRIVACY_SCORE } from '../utils/constants';

export class PrivacyScoreManager {
  private static listenersSetup = false;
  private static readonly TRACKER_PENALTY = PRIVACY_SCORE.TRACKER_PENALTY;
  private static readonly CLEAN_SITE_REWARD = PRIVACY_SCORE.CLEAN_SITE_REWARD;
  private static readonly NON_COMPLIANT_PENALTY = PRIVACY_SCORE.NON_COMPLIANT_PENALTY;
  private static readonly COOLDOWN_MS = TIME.ONE_DAY_MS;
  private static readonly CLEANUP_THRESHOLD = TIME.ONE_WEEK_MS;

  // Track penalized domains with timestamps (domain -> timestamp)
  private static penalizedDomains = new Map<string, number>();

  static async initialize(): Promise<void> {
    // Load persisted penalties from storage
    const data = await Storage.get();
    if (data.penalizedDomains) {
      this.penalizedDomains = new Map(Object.entries(data.penalizedDomains));
      logger.info('PrivacyScore', `Loaded ${this.penalizedDomains.size} penalized domains from storage`);
    }
    
    if (!this.listenersSetup) {
      this.setupEventListeners();
      this.listenersSetup = true;
    }
  }

  private static setupEventListeners(): void {
    // Listen to tracker blocked events
    backgroundEvents.on('TRACKER_BLOCKED', async (data) => {
      await this.handleTrackerBlocked(data.domain, data.riskWeight);
    });

    // Listen to clean site detected events
    backgroundEvents.on('CLEAN_SITE_DETECTED', async () => {
      await this.handleCleanSite();
    });

    // Listen to non-compliant site events
    backgroundEvents.on('NON_COMPLIANT_SITE', async () => {
      await this.handleNonCompliantSite();
    });

    logger.debug('PrivacyScore', 'Event listeners setup complete');
  }

  static async handleTrackerBlocked(domain: string, riskWeight: number = 1): Promise<number> {
    try {
      const now = Date.now();
      const lastPenalty = this.penalizedDomains.get(domain);

      // Check if we penalized this domain recently (24 hours)
      if (lastPenalty && (now - lastPenalty) < this.COOLDOWN_MS) {
        logger.debug('PrivacyScore', `Already penalized ${domain} today, skipping`, {
          domain,
          lastPenalty,
          cooldownRemaining: this.COOLDOWN_MS - (now - lastPenalty)
        });
        return await this.getCurrentScore();
      }

      // Apply penalty and remember
      this.penalizedDomains.set(domain, now);
      // Persist to storage so it survives service worker restarts
      await Storage.savePenalizedDomains(Object.fromEntries(this.penalizedDomains));
      logger.info('PrivacyScore', `Penalizing ${domain}`, {
        domain,
        riskWeight,
        penalty: this.TRACKER_PENALTY * riskWeight
      });

      const data = await Storage.get();
      const oldScore = data.privacyScore.current;
      // Apply risk-weighted penalty (e.g., fingerprinting = -5, analytics = -1)
      const penalty = this.TRACKER_PENALTY * riskWeight;
      const newScore = oldScore + penalty;

      // Emit score update event
      backgroundEvents.emit('SCORE_UPDATED', {
        oldScore,
        newScore,
        reason: `Tracker blocked: ${domain} (weight: ${riskWeight})`,
      });

      logger.debug('PrivacyScore', 'Tracker blocked', { penalty, newScore, riskWeight });

      // Cleanup old entries periodically (every 100 penalties)
      if (this.penalizedDomains.size % 100 === 0) {
        this.cleanupOldPenalties();
      }

      return newScore;
    } catch (error) {
      logger.error('PrivacyScore', 'Error handling tracker block', toError(error));
      return 100;
    }
  }

  private static cleanupOldPenalties(): void {
    const cutoff = Date.now() - this.CLEANUP_THRESHOLD;
    let cleaned = 0;

    for (const [domain, timestamp] of this.penalizedDomains.entries()) {
      if (timestamp < cutoff) {
        this.penalizedDomains.delete(domain);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.debug('PrivacyScore', `Cleaned up ${cleaned} old penalty entries`);
    }
  }

  static resetPenaltyTracking(): void {
    logger.info('PrivacyScore', 'Resetting penalty tracking');
    this.penalizedDomains.clear();
  }

  static getPenalizedDomainCount(): number {
    return this.penalizedDomains.size;
  }

  static isDomainInCooldown(domain: string): boolean {
    const lastPenalty = this.penalizedDomains.get(domain);
    if (!lastPenalty) return false;

    const now = Date.now();
    return (now - lastPenalty) < this.COOLDOWN_MS;
  }

  static async handleCleanSite(): Promise<number> {
    try {
      const data = await Storage.get();
      const oldScore = data.privacyScore.current;
      const newScore = oldScore + this.CLEAN_SITE_REWARD;

      // Emit score update event
      backgroundEvents.emit('SCORE_UPDATED', {
        oldScore,
        newScore,
        reason: 'Clean site detected',
      });

      await Storage.recordCleanSite();

      logger.debug('PrivacyScore', 'Clean site rewarded', { reward: this.CLEAN_SITE_REWARD, newScore });
      return newScore;
    } catch (error) {
      logger.error('PrivacyScore', 'Error handling clean site', toError(error));
      return 100;
    }
  }

  static async handleNonCompliantSite(): Promise<number> {
    try {
      const data = await Storage.get();
      const oldScore = data.privacyScore.current;
      const newScore = oldScore + this.NON_COMPLIANT_PENALTY;

      // Emit score update event
      backgroundEvents.emit('SCORE_UPDATED', {
        oldScore,
        newScore,
        reason: 'Non-compliant cookie banner detected',
      });

      await Storage.recordNonCompliantSite();

      logger.warn('PrivacyScore', 'Non-compliant site detected', { penalty: this.NON_COMPLIANT_PENALTY, newScore });
      return newScore;
    } catch (error) {
      logger.error('PrivacyScore', 'Error handling non-compliant site', toError(error));
      return 100;
    }
  }

  static async getCurrentScore(): Promise<number> {
    try {
      const data = await Storage.get();
      return data.privacyScore.current;
    } catch (error) {
      logger.error('PrivacyScore', 'Error getting current score', toError(error));
      return 100;
    }
  }

  static getScoreColor(score: number): string {
    if (score >= 80) return '#10B981';
    if (score >= 60) return '#F59E0B';
    return BADGE.BACKGROUND_COLOR;
  }

  static getScoreLabel(score: number): string {
    if (score >= 80) return 'Excellent';
    if (score >= 60) return 'Good';
    if (score >= 40) return 'Fair';
    return 'Poor';
  }
}

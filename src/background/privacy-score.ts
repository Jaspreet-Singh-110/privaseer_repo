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

    logger.info('PrivacyScore', '🔄 INITIALIZING PrivacyScoreManager', {
      hasPenalizedDomains: !!data.penalizedDomains,
      penalizedDomainsType: typeof data.penalizedDomains,
      penalizedDomainsKeys: data.penalizedDomains ? Object.keys(data.penalizedDomains).length : 0
    });

    if (data.penalizedDomains) {
      this.penalizedDomains = new Map(Object.entries(data.penalizedDomains));
      logger.info('PrivacyScore', `✅ Loaded ${this.penalizedDomains.size} penalized domains from storage`, {
        domains: Array.from(this.penalizedDomains.keys())
      });
    } else {
      logger.warn('PrivacyScore', '⚠️ No penalizedDomains found in storage, starting fresh');
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
    backgroundEvents.on('NON_COMPLIANT_SITE', async (data) => {
      await this.handleNonCompliantSite(data.domain);
    });

    logger.debug('PrivacyScore', 'Event listeners setup complete');
  }

  static async handleTrackerBlocked(domain: string, riskWeight: number = 1): Promise<number> {
    try {
      const now = Date.now();
      const lastPenalty = this.penalizedDomains.get(domain);

      logger.info('PrivacyScore', `Checking penalty for ${domain}`, {
        domain,
        hasPreviousPenalty: !!lastPenalty,
        lastPenalty: lastPenalty ? new Date(lastPenalty).toISOString() : 'never',
        mapSize: this.penalizedDomains.size,
        cooldownMS: this.COOLDOWN_MS
      });

      // Check if we penalized this domain recently (24 hours)
      if (lastPenalty && (now - lastPenalty) < this.COOLDOWN_MS) {
        const cooldownRemaining = this.COOLDOWN_MS - (now - lastPenalty);
        const hoursRemaining = Math.floor(cooldownRemaining / (60 * 60 * 1000));
        logger.info('PrivacyScore', `🛑 COOLDOWN ACTIVE - Skipping penalty for ${domain}`, {
          domain,
          lastPenaltyDate: new Date(lastPenalty).toISOString(),
          hoursRemaining,
          currentScore: await this.getCurrentScore()
        });
        return await this.getCurrentScore();
      }

      // Apply penalty and remember
      logger.info('PrivacyScore', `✅ APPLYING PENALTY to ${domain}`, {
        domain,
        riskWeight,
        penalty: this.TRACKER_PENALTY * riskWeight,
        timestamp: new Date(now).toISOString()
      });

      this.penalizedDomains.set(domain, now);
      // Persist to storage so it survives service worker restarts
      await Storage.savePenalizedDomains(Object.fromEntries(this.penalizedDomains));

      logger.info('PrivacyScore', `💾 Saved ${this.penalizedDomains.size} penalized domains to storage`);

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

  static async handleNonCompliantSite(domain: string): Promise<number> {
    try {
      const now = Date.now();
      const penaltyKey = `non-compliant:${domain}`;
      const lastPenalty = this.penalizedDomains.get(penaltyKey);

      logger.info('PrivacyScore', `Checking non-compliant penalty for ${domain}`, {
        domain,
        hasPreviousPenalty: !!lastPenalty,
        lastPenalty: lastPenalty ? new Date(lastPenalty).toISOString() : 'never',
        mapSize: this.penalizedDomains.size
      });

      // Check if we penalized this domain recently (24 hours)
      if (lastPenalty && (now - lastPenalty) < this.COOLDOWN_MS) {
        const cooldownRemaining = this.COOLDOWN_MS - (now - lastPenalty);
        const hoursRemaining = Math.floor(cooldownRemaining / (60 * 60 * 1000));
        logger.info('PrivacyScore', `🛑 COOLDOWN ACTIVE - Skipping non-compliant penalty for ${domain}`, {
          domain,
          lastPenaltyDate: new Date(lastPenalty).toISOString(),
          hoursRemaining,
          currentScore: await this.getCurrentScore()
        });
        return await this.getCurrentScore();
      }

      // Apply penalty and remember
      logger.warn('PrivacyScore', `⚠️ APPLYING NON-COMPLIANT PENALTY to ${domain}`, {
        domain,
        penalty: this.NON_COMPLIANT_PENALTY,
        timestamp: new Date(now).toISOString()
      });

      this.penalizedDomains.set(penaltyKey, now);
      await Storage.savePenalizedDomains(Object.fromEntries(this.penalizedDomains));

      logger.info('PrivacyScore', `💾 Saved ${this.penalizedDomains.size} penalized domains to storage`);

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

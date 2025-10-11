import { Storage } from './storage';
import { logger } from '../utils/logger';

export class PrivacyScoreManager {
  private static readonly TRACKER_PENALTY = -1;
  private static readonly CLEAN_SITE_REWARD = 2;
  private static readonly NON_COMPLIANT_PENALTY = -5;
  private static readonly COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours
  private static readonly CLEANUP_THRESHOLD = 7 * 24 * 60 * 60 * 1000; // 7 days

  // Track penalized domains with timestamps (domain -> timestamp)
  private static penalizedDomains = new Map<string, number>();

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
      logger.info('PrivacyScore', `Penalizing ${domain}`, {
        domain,
        riskWeight,
        penalty: this.TRACKER_PENALTY * riskWeight
      });

      const data = await Storage.get();
      // Apply risk-weighted penalty (e.g., fingerprinting = -5, analytics = -1)
      const penalty = this.TRACKER_PENALTY * riskWeight;
      const newScore = data.privacyScore.current + penalty;
      await Storage.updateScore(newScore);

      await this.updateBadge(data.privacyScore.daily.trackersBlocked);

      logger.debug('PrivacyScore', 'Tracker blocked', { penalty, newScore, riskWeight });

      // Cleanup old entries periodically (every 100 penalties)
      if (this.penalizedDomains.size % 100 === 0) {
        this.cleanupOldPenalties();
      }

      return newScore;
    } catch (error) {
      logger.error('PrivacyScore', 'Error handling tracker block', error as Error);
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
      const newScore = data.privacyScore.current + this.CLEAN_SITE_REWARD;
      await Storage.updateScore(newScore);
      await Storage.recordCleanSite();

      logger.debug('PrivacyScore', 'Clean site rewarded', { reward: this.CLEAN_SITE_REWARD, newScore });
      return newScore;
    } catch (error) {
      logger.error('PrivacyScore', 'Error handling clean site', error as Error);
      return 100;
    }
  }

  static async handleNonCompliantSite(): Promise<number> {
    try {
      const data = await Storage.get();
      const newScore = data.privacyScore.current + this.NON_COMPLIANT_PENALTY;
      await Storage.updateScore(newScore);
      await Storage.recordNonCompliantSite();

      logger.warn('PrivacyScore', 'Non-compliant site detected', { penalty: this.NON_COMPLIANT_PENALTY, newScore });
      return newScore;
    } catch (error) {
      logger.error('PrivacyScore', 'Error handling non-compliant site', error as Error);
      return 100;
    }
  }

  static async getCurrentScore(): Promise<number> {
    try {
      const data = await Storage.get();
      return data.privacyScore.current;
    } catch (error) {
      logger.error('PrivacyScore', 'Error getting current score', error as Error);
      return 100;
    }
  }

  private static async updateBadge(trackersBlocked: number): Promise<void> {
    try {
      const badgeText = trackersBlocked > 0 ? trackersBlocked.toString() : '';

      await chrome.action.setBadgeText({ text: badgeText });
      await chrome.action.setBadgeBackgroundColor({ color: '#DC2626' });
    } catch (error) {
      logger.error('PrivacyScore', 'Error updating badge', error as Error);
    }
  }

  static getScoreColor(score: number): string {
    if (score >= 80) return '#10B981';
    if (score >= 60) return '#F59E0B';
    return '#DC2626';
  }

  static getScoreLabel(score: number): string {
    if (score >= 80) return 'Excellent';
    if (score >= 60) return 'Good';
    if (score >= 40) return 'Fair';
    return 'Poor';
  }
}

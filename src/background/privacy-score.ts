import { Storage } from './storage';
import { logger } from '../utils/logger';

export class PrivacyScoreManager {
  private static readonly TRACKER_PENALTY = -1;
  private static readonly CLEAN_SITE_REWARD = 2;
  private static readonly NON_COMPLIANT_PENALTY = -5;

  static async handleTrackerBlocked(riskWeight: number = 1): Promise<number> {
    try {
      const data = await Storage.get();
      // Apply risk-weighted penalty (e.g., fingerprinting = -5, analytics = -1)
      const penalty = this.TRACKER_PENALTY * riskWeight;
      const newScore = data.privacyScore.current + penalty;
      await Storage.updateScore(newScore);

      await this.updateBadge(data.privacyScore.daily.trackersBlocked);

      logger.debug('PrivacyScore', 'Tracker blocked', { penalty, newScore, riskWeight });
      return newScore;
    } catch (error) {
      logger.error('PrivacyScore', 'Error handling tracker block', error as Error);
      return 100;
    }
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

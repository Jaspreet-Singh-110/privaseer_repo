import { Storage } from './storage';

export class PrivacyScoreManager {
  private static readonly TRACKER_PENALTY = -1;
  private static readonly CLEAN_SITE_REWARD = 2;
  private static readonly NON_COMPLIANT_PENALTY = -5;

  static async handleTrackerBlocked(): Promise<number> {
    try {
      const data = await Storage.get();
      const newScore = data.privacyScore.current + this.TRACKER_PENALTY;
      await Storage.updateScore(newScore);

      await this.updateBadge(data.privacyScore.daily.trackersBlocked);

      return newScore;
    } catch (error) {
      console.error('Error handling tracker block:', error);
      return 100;
    }
  }

  static async handleCleanSite(): Promise<number> {
    try {
      const data = await Storage.get();
      const newScore = data.privacyScore.current + this.CLEAN_SITE_REWARD;
      await Storage.updateScore(newScore);
      await Storage.recordCleanSite();

      return newScore;
    } catch (error) {
      console.error('Error handling clean site:', error);
      return 100;
    }
  }

  static async handleNonCompliantSite(): Promise<number> {
    try {
      const data = await Storage.get();
      const newScore = data.privacyScore.current + this.NON_COMPLIANT_PENALTY;
      await Storage.updateScore(newScore);
      await Storage.recordNonCompliantSite();

      return newScore;
    } catch (error) {
      console.error('Error handling non-compliant site:', error);
      return 100;
    }
  }

  static async getCurrentScore(): Promise<number> {
    try {
      const data = await Storage.get();
      return data.privacyScore.current;
    } catch (error) {
      console.error('Error getting current score:', error);
      return 100;
    }
  }

  private static async updateBadge(trackersBlocked: number): Promise<void> {
    try {
      const badgeText = trackersBlocked > 0 ? trackersBlocked.toString() : '';

      await chrome.action.setBadgeText({ text: badgeText });
      await chrome.action.setBadgeBackgroundColor({ color: '#DC2626' });
    } catch (error) {
      console.error('Error updating badge:', error);
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

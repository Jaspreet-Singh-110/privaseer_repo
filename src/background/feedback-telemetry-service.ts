import { logger } from '../utils/logger';
import { toError } from '../utils/type-guards';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const FEEDBACK_ENDPOINT = `${SUPABASE_URL}/functions/v1/submit-feedback/feedback`;
const TELEMETRY_ENDPOINT = `${SUPABASE_URL}/functions/v1/submit-feedback/telemetry`;
const EXTENSION_VERSION = '2.4.0';

interface FeedbackData {
  feedbackText: string;
  url?: string;
  domain?: string;
}

interface TelemetryEvent {
  eventType: string;
  eventData?: Record<string, unknown>;
}

class FeedbackTelemetryService {
  private installationId: string | null = null;
  private browserVersion: string | null = null;

  async initialize(): Promise<void> {
    try {
      this.installationId = await this.getOrCreateInstallationId();
      this.browserVersion = await this.getBrowserVersion();
      logger.info('FeedbackTelemetryService', 'Initialized', {
        installationId: this.installationId.substring(0, 8) + '...',
      });
    } catch (error) {
      logger.error('FeedbackTelemetryService', 'Failed to initialize', toError(error));
    }
  }

  private async getOrCreateInstallationId(): Promise<string> {
    const result = await chrome.storage.local.get('installationId');

    if (result.installationId) {
      return result.installationId;
    }

    const newId = crypto.randomUUID();
    await chrome.storage.local.set({ installationId: newId });
    return newId;
  }

  private async getBrowserVersion(): Promise<string> {
    try {
      const info = await chrome.runtime.getPlatformInfo();
      return `Chrome ${info.os}`;
    } catch {
      return 'Unknown';
    }
  }

  async submitFeedback(data: FeedbackData): Promise<{ success: boolean; error?: string }> {
    try {
      if (!this.installationId) {
        await this.initialize();
      }

      const response = await fetch(FEEDBACK_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          installationId: this.installationId,
          feedbackText: data.feedbackText,
          url: data.url,
          domain: data.domain,
          extensionVersion: EXTENSION_VERSION,
          browserVersion: this.browserVersion,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      logger.info('FeedbackTelemetryService', 'Feedback submitted successfully');
      return { success: true };
    } catch (error) {
      const err = toError(error);
      logger.error('FeedbackTelemetryService', 'Failed to submit feedback', err);
      return { success: false, error: err.message };
    }
  }

  async trackEvent(event: TelemetryEvent): Promise<void> {
    try {
      if (!this.installationId) {
        await this.initialize();
      }

      const response = await fetch(TELEMETRY_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          installationId: this.installationId,
          eventType: event.eventType,
          eventData: event.eventData || {},
          extensionVersion: EXTENSION_VERSION,
          browserVersion: this.browserVersion,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      logger.debug('FeedbackTelemetryService', 'Event tracked', { eventType: event.eventType });
    } catch (error) {
      logger.error('FeedbackTelemetryService', 'Failed to track event', toError(error));
    }
  }

  async getInstallationId(): Promise<string> {
    if (!this.installationId) {
      await this.initialize();
    }
    return this.installationId!;
  }
}

export const feedbackTelemetryService = new FeedbackTelemetryService();

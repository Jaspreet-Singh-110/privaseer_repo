import type { BurnerEmail } from '../types';
import { logger } from '../utils/logger';
import { toError } from '../utils/type-guards';

class BurnerEmailService {
  private installationId: string | null = null;
  private supabaseUrl: string = import.meta.env.VITE_SUPABASE_URL;
  private supabaseAnonKey: string = import.meta.env.VITE_SUPABASE_ANON_KEY;
  private apiUrl: string;

  constructor() {
    this.apiUrl = `${this.supabaseUrl}/functions/v1/generate-burner-email`;
  }

  async initialize(): Promise<void> {
    this.installationId = await this.getOrCreateInstallationId();
    logger.debug('BurnerEmailService', 'Initialized', {
      installationId: this.installationId,
      apiUrl: this.apiUrl
    });
  }

  private async getOrCreateInstallationId(): Promise<string> {
    const stored = await chrome.storage.local.get('installationId');

    if (stored.installationId) {
      return stored.installationId;
    }

    const newId = crypto.randomUUID();
    await chrome.storage.local.set({ installationId: newId });
    return newId;
  }

  async generateEmail(domain: string, url?: string, label?: string): Promise<string> {
    try {
      if (!this.installationId) {
        await this.initialize();
      }

      logger.debug('BurnerEmailService', 'Making API request', {
        apiUrl: this.apiUrl,
        domain,
        installationId: this.installationId
      });

      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.supabaseAnonKey}`,
        },
        body: JSON.stringify({
          installationId: this.installationId,
          domain,
          url,
          label,
        }),
      });

      logger.debug('BurnerEmailService', 'API response received', {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok
      });

      let data;
      try {
        data = await response.json();
      } catch (parseError) {
        logger.error('BurnerEmailService', 'Failed to parse response', toError(parseError));
        throw new Error('Invalid response from server');
      }

      logger.debug('BurnerEmailService', 'Response data', { data });

      if (!response.ok || !data.success) {
        const errorMsg = data.error || `Server error: ${response.status} ${response.statusText}`;
        logger.error('BurnerEmailService', 'API request failed', new Error(errorMsg));
        throw new Error(errorMsg);
      }

      logger.info('BurnerEmailService', 'Burner email generated', {
        domain,
        email: data.email.email,
      });

      return data.email.email;
    } catch (error) {
      logger.error('BurnerEmailService', 'Failed to generate burner email', toError(error));
      throw error;
    }
  }

  async getEmails(): Promise<BurnerEmail[]> {
    try {
      if (!this.installationId) {
        await this.initialize();
      }

      const response = await fetch(
        `${this.apiUrl}?installationId=${this.installationId}`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${this.supabaseAnonKey}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to fetch burner emails');
      }

      return data.emails || [];
    } catch (error) {
      logger.error('BurnerEmailService', 'Failed to fetch burner emails', toError(error));
      throw error;
    }
  }

  async deleteEmail(emailId: string): Promise<void> {
    try {
      if (!this.installationId) {
        await this.initialize();
      }

      const response = await fetch(
        `${this.apiUrl}?emailId=${emailId}&installationId=${this.installationId}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${this.supabaseAnonKey}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to delete burner email');
      }

      logger.info('BurnerEmailService', 'Burner email deleted', { emailId });
    } catch (error) {
      logger.error('BurnerEmailService', 'Failed to delete burner email', toError(error));
      throw error;
    }
  }

  async copyToClipboard(email: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(email);
      logger.debug('BurnerEmailService', 'Email copied to clipboard', { email });
    } catch (error) {
      logger.error('BurnerEmailService', 'Failed to copy email', toError(error));
      throw error;
    }
  }
}

export const burnerEmailService = new BurnerEmailService();

import type { BurnerEmail } from '../types';
import { logger } from '../utils/logger';
import { toError } from '../utils/type-guards';

class BurnerEmailService {
  private installationId: string | null = null;
  private supabaseUrl: string = 'https://uhluvcfnkwmkqvjfjsfh.supabase.co';
  private supabaseAnonKey: string = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVobHV2Y2Zua3dta3F2amZqc2ZoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk1MDg2MzMsImV4cCI6MjA3NTA4NDYzM30.QCVlByG6-9962uUdtX0huucgeMJ80iRR2D4kqnPVmZ4';
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
      console.log('[BURNER EMAIL] Starting generation', { domain, url, label });

      if (!this.installationId) {
        await this.initialize();
      }

      console.log('[BURNER EMAIL] Installation ID:', this.installationId);
      console.log('[BURNER EMAIL] API URL:', this.apiUrl);

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

      console.log('[BURNER EMAIL] Response status:', response.status, response.statusText);

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

      console.log('[BURNER EMAIL] Response data:', data);

      logger.debug('BurnerEmailService', 'Response data', { data });

      if (!response.ok || !data.success) {
        const errorMsg = data.error || `Server error: ${response.status} ${response.statusText}`;
        console.error('[BURNER EMAIL] API request failed:', errorMsg);
        logger.error('BurnerEmailService', 'API request failed', new Error(errorMsg));
        throw new Error(errorMsg);
      }

      logger.info('BurnerEmailService', 'Burner email generated', {
        domain,
        email: data.email.email,
      });

      console.log('[BURNER EMAIL] Success! Email:', data.email.email);
      return data.email.email;
    } catch (error) {
      console.error('[BURNER EMAIL] Error:', error);
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

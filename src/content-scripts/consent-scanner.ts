import type { ConsentScanResult, PrivacyRules } from '../types';
import { logger } from '../utils/logger';
import { toError } from '../utils/type-guards';
import { sanitizeUrl } from '../utils/sanitizer';
import { SCANNER, CONSENT_BANNER } from '../utils/constants';

class ConsentScanner {
  private rules: PrivacyRules | null = null;
  private scanTimeout: NodeJS.Timeout | null = null;

  async initialize(): Promise<void> {
    try {
      const response = await fetch(chrome.runtime.getURL('data/privacy-rules.json'));
      this.rules = await response.json();

      this.scanTimeout = setTimeout(() => this.scanPage(), SCANNER.INITIAL_SCAN_DELAY_MS);

      const observer = new MutationObserver(() => {
        if (this.scanTimeout) {
          clearTimeout(this.scanTimeout);
        }
        this.scanTimeout = setTimeout(() => this.scanPage(), SCANNER.MUTATION_DEBOUNCE_MS);
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
      });
      
      logger.debug('ConsentScanner', 'Initialized successfully', { url: sanitizeUrl(window.location.href) });
    } catch (error) {
      logger.error('ConsentScanner', 'Failed to initialize consent scanner', toError(error));
    }
  }

  private async scanPage(): Promise<void> {
    if (!this.rules || !document.body) return;

    try {
      const banner = this.findCookieBanner();

      if (!banner) {
        return;
      }

      const hasRejectButton = this.findRejectButton(banner);
      const isCompliant = this.checkCompliance(banner, hasRejectButton);
      const deceptivePatterns = this.detectDeceptivePatterns(banner, hasRejectButton);

      const result: ConsentScanResult = {
        url: sanitizeUrl(window.location.href) || '',
        hasBanner: true,
        hasRejectButton,
        isCompliant,
        deceptivePatterns,
        timestamp: Date.now(),
      };

      try {
        await chrome.runtime.sendMessage({
          type: 'CONSENT_SCAN_RESULT',
          data: result,
        });
        
        if (!result.isCompliant) {
          logger.warn('ConsentScanner', 'Non-compliant cookie banner detected', {
            url: sanitizeUrl(window.location.href),
            hasRejectButton: result.hasRejectButton,
            deceptivePatterns: result.deceptivePatterns
          });
        }
      } catch (error) {
        // Service worker might not be ready yet, ignore the error
        logger.debug('ConsentScanner', 'Service worker not ready, skipping message');
      }
    } catch (error) {
      logger.error('ConsentScanner', 'Error scanning page', toError(error));
    }
  }

  private findCookieBanner(): Element | null {
    if (!this.rules) return null;

    for (const selector of this.rules.cookieBannerSelectors) {
      try {
        const element = document.querySelector(selector);
        if (element && this.isVisible(element)) {
          return element;
        }
      } catch (error) {
        continue;
      }
    }

    const allElements = document.querySelectorAll('div, section, aside');
    for (const element of allElements) {
      const text = element.textContent?.toLowerCase() || '';
      if (
        (text.includes('cookie') || text.includes('privacy') || text.includes('consent')) &&
        text.length < CONSENT_BANNER.MAX_TEXT_LENGTH &&
        this.isVisible(element)
      ) {
        return element;
      }
    }

    return null;
  }

  private findRejectButton(banner: Element): boolean {
    if (!this.rules) return false;

    const buttons = banner.querySelectorAll('button, a, [role="button"]');

    for (const button of buttons) {
      const text = (button.textContent || '').toLowerCase().trim();
      const ariaLabel = button.getAttribute('aria-label')?.toLowerCase() || '';

      for (const pattern of this.rules.rejectButtonPatterns) {
        if (text.includes(pattern) || ariaLabel.includes(pattern)) {
          return this.isVisible(button);
        }
      }
    }

    return false;
  }

  private checkCompliance(banner: Element, hasRejectButton: boolean): boolean {
    if (!this.rules) return true;

    if (!hasRejectButton) {
      return false;
    }

    const acceptButtons = this.findAcceptButtons(banner);
    const rejectButtons = this.findRejectButtonElements(banner);

    if (acceptButtons.length > 0 && rejectButtons.length > 0) {
      const acceptButton = acceptButtons[0];
      const rejectButton = rejectButtons[0];

      const acceptRect = acceptButton.getBoundingClientRect();
      const rejectRect = rejectButton.getBoundingClientRect();

      const acceptArea = acceptRect.width * acceptRect.height;
      const rejectArea = rejectRect.width * rejectRect.height;

      if (acceptArea > rejectArea * CONSENT_BANNER.BUTTON_SIZE_PROMINENCE_THRESHOLD) {
        return false;
      }
    }

    return true;
  }

  private detectDeceptivePatterns(banner: Element, hasRejectButton: boolean): string[] {
    const patterns: string[] = [];

    if (!hasRejectButton) {
      patterns.push('Forced Consent');
      return patterns;
    }

    const acceptButtons = this.findAcceptButtons(banner);
    const rejectButtons = this.findRejectButtonElements(banner);

    if (acceptButtons.length > 0 && rejectButtons.length > 0) {
      const acceptButton = acceptButtons[0];
      const rejectButton = rejectButtons[0];

      const acceptStyle = window.getComputedStyle(acceptButton);
      const rejectStyle = window.getComputedStyle(rejectButton);

      if (parseFloat(acceptStyle.fontSize) > parseFloat(rejectStyle.fontSize) * CONSENT_BANNER.FONT_SIZE_PROMINENCE_THRESHOLD) {
        patterns.push('Dark Pattern');
      }

      const acceptRect = acceptButton.getBoundingClientRect();
      const rejectRect = rejectButton.getBoundingClientRect();

      if (rejectRect.bottom > window.innerHeight) {
        patterns.push('Hidden Reject');
      }
    }

    return patterns;
  }

  private findAcceptButtons(banner: Element): Element[] {
    if (!this.rules) return [];

    const buttons = banner.querySelectorAll('button, a, [role="button"]');
    const acceptButtons: Element[] = [];

    for (const button of buttons) {
      const text = (button.textContent || '').toLowerCase().trim();
      const ariaLabel = button.getAttribute('aria-label')?.toLowerCase() || '';

      for (const pattern of this.rules.acceptButtonPatterns) {
        if (text.includes(pattern) || ariaLabel.includes(pattern)) {
          acceptButtons.push(button);
          break;
        }
      }
    }

    return acceptButtons;
  }

  private findRejectButtonElements(banner: Element): Element[] {
    if (!this.rules) return [];

    const buttons = banner.querySelectorAll('button, a, [role="button"]');
    const rejectButtons: Element[] = [];

    for (const button of buttons) {
      const text = (button.textContent || '').toLowerCase().trim();
      const ariaLabel = button.getAttribute('aria-label')?.toLowerCase() || '';

      for (const pattern of this.rules.rejectButtonPatterns) {
        if (text.includes(pattern) || ariaLabel.includes(pattern)) {
          rejectButtons.push(button);
          break;
        }
      }
    }

    return rejectButtons;
  }

  private isVisible(element: Element): boolean {
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;

    const style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      return false;
    }

    return true;
  }
}

const scanner = new ConsentScanner();
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => scanner.initialize());
} else {
  scanner.initialize();
}

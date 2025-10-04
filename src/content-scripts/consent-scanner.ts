import type { ConsentScanResult, PrivacyRules } from '../types';

class ConsentScanner {
  private rules: PrivacyRules | null = null;
  private scanTimeout: NodeJS.Timeout | null = null;

  async initialize(): Promise<void> {
    try {
      const response = await fetch(chrome.runtime.getURL('data/privacy-rules.json'));
      this.rules = await response.json();

      this.scanTimeout = setTimeout(() => this.scanPage(), 2000);

      const observer = new MutationObserver(() => {
        if (this.scanTimeout) {
          clearTimeout(this.scanTimeout);
        }
        this.scanTimeout = setTimeout(() => this.scanPage(), 500);
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
      });
    } catch (error) {
      console.error('Failed to initialize consent scanner:', error);
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
        url: window.location.href,
        hasBanner: true,
        hasRejectButton,
        isCompliant,
        deceptivePatterns,
        timestamp: Date.now(),
      };

      await chrome.runtime.sendMessage({
        type: 'CONSENT_SCAN_RESULT',
        data: result,
      });
    } catch (error) {
      console.error('Error scanning page:', error);
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
        text.length < 2000 &&
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

      if (acceptArea > rejectArea * 1.5) {
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

      if (parseFloat(acceptStyle.fontSize) > parseFloat(rejectStyle.fontSize) * 1.2) {
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

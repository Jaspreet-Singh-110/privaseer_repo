import { logger } from '../utils/logger';
import { toError } from '../utils/type-guards';

class EmailAutofill {
  private isProcessing: boolean = false;
  private lastFocusedInput: HTMLInputElement | null = null;
  private burnerEmailButton: HTMLElement | null = null;

  async initialize(): Promise<void> {
    try {
      this.setupInputDetection();
      logger.debug('EmailAutofill', 'Initialized successfully', { url: window.location.href });
    } catch (error) {
      logger.error('EmailAutofill', 'Failed to initialize', toError(error));
    }
  }

  private setupInputDetection(): void {
    document.addEventListener('focusin', (event) => {
      const target = event.target as HTMLElement;

      if (this.isEmailInput(target)) {
        this.lastFocusedInput = target as HTMLInputElement;
        this.showBurnerEmailButton(target as HTMLInputElement);
      }
    });

    document.addEventListener('focusout', (event) => {
      const target = event.target as HTMLElement;

      if (this.isEmailInput(target)) {
        setTimeout(() => {
          const clickedElement = event.relatedTarget as HTMLElement;
          if (clickedElement !== this.burnerEmailButton && !this.burnerEmailButton?.contains(clickedElement)) {
            this.hideBurnerEmailButton();
          }
        }, 200);
      }
    });

    const observer = new MutationObserver(() => {
      this.detectNewEmailInputs();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  private isEmailInput(element: HTMLElement): boolean {
    if (!(element instanceof HTMLInputElement)) return false;

    const type = element.type?.toLowerCase();
    const name = element.name?.toLowerCase();
    const id = element.id?.toLowerCase();
    const placeholder = element.placeholder?.toLowerCase();
    const autocomplete = element.autocomplete?.toLowerCase();

    return (
      type === 'email' ||
      autocomplete === 'email' ||
      name?.includes('email') ||
      id?.includes('email') ||
      placeholder?.includes('email') ||
      placeholder?.includes('e-mail')
    );
  }

  private detectNewEmailInputs(): void {
    const inputs = document.querySelectorAll('input[type="email"], input[name*="email" i], input[id*="email" i]');

    inputs.forEach((input) => {
      if (input instanceof HTMLInputElement && !input.dataset.burnerEmailReady) {
        input.dataset.burnerEmailReady = 'true';
      }
    });
  }

  private showBurnerEmailButton(input: HTMLInputElement): void {
    if (this.burnerEmailButton) {
      this.hideBurnerEmailButton();
    }

    const button = document.createElement('div');
    button.id = 'privaseer-burner-email-btn';
    button.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
        <polyline points="22,6 12,13 2,6"></polyline>
        <path d="M12 13l-8 5"></path>
        <path d="M12 13l8 5"></path>
      </svg>
      <span>Generate Burner Email</span>
    `;

    button.style.cssText = `
      position: absolute;
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 8px 12px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      z-index: 999999;
      box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
      transition: all 0.2s ease;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;

    button.addEventListener('mouseenter', () => {
      button.style.transform = 'translateY(-2px)';
      button.style.boxShadow = '0 6px 16px rgba(102, 126, 234, 0.5)';
    });

    button.addEventListener('mouseleave', () => {
      button.style.transform = 'translateY(0)';
      button.style.boxShadow = '0 4px 12px rgba(102, 126, 234, 0.4)';
    });

    button.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });

    button.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();

      button.style.opacity = '0.6';
      button.style.pointerEvents = 'none';

      await this.generateAndFillBurnerEmail(input);
    });

    this.positionButton(button, input);
    document.body.appendChild(button);
    this.burnerEmailButton = button;
  }

  private positionButton(button: HTMLElement, input: HTMLInputElement): void {
    const rect = input.getBoundingClientRect();
    const scrollY = window.scrollY || window.pageYOffset;
    const scrollX = window.scrollX || window.pageXOffset;

    button.style.top = `${rect.bottom + scrollY + 8}px`;
    button.style.left = `${rect.left + scrollX}px`;
  }

  private hideBurnerEmailButton(): void {
    if (this.burnerEmailButton) {
      this.burnerEmailButton.remove();
      this.burnerEmailButton = null;
    }
  }

  private async generateAndFillBurnerEmail(input: HTMLInputElement): Promise<void> {
    if (this.isProcessing) {
      logger.debug('EmailAutofill', 'Already processing, ignoring click');
      return;
    }

    this.isProcessing = true;
    logger.debug('EmailAutofill', 'Starting burner email generation');

    try {
      const domain = new URL(window.location.href).hostname;

      logger.debug('EmailAutofill', 'Sending message to background', { domain });

      const response = await chrome.runtime.sendMessage({
        type: 'GENERATE_BURNER_EMAIL',
        data: {
          domain,
          url: window.location.href,
        },
      });

      logger.debug('EmailAutofill', 'Received response', { response });

      if (response && response.success && response.email) {
        input.value = response.email;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));

        this.showSuccessNotification(response.email);
        this.hideBurnerEmailButton();

        logger.info('EmailAutofill', 'Burner email generated and filled', { domain, email: response.email });
      } else {
        const errorMsg = response?.error || 'Failed to generate burner email';
        logger.error('EmailAutofill', 'Generation failed', new Error(errorMsg));
        this.showErrorNotification(errorMsg);
        this.hideBurnerEmailButton();
      }
    } catch (error) {
      logger.error('EmailAutofill', 'Failed to generate burner email', toError(error));
      this.showErrorNotification('Could not connect to service');
      this.hideBurnerEmailButton();
    } finally {
      this.isProcessing = false;
    }
  }

  private showSuccessNotification(email: string): void {
    const notification = document.createElement('div');
    notification.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px;">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
          <polyline points="22 4 12 14.01 9 11.01"></polyline>
        </svg>
        <div>
          <div style="font-weight: 600; margin-bottom: 2px;">Burner Email Created</div>
          <div style="font-size: 12px; opacity: 0.9;">${email}</div>
        </div>
      </div>
    `;

    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 16px 20px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border-radius: 8px;
      font-size: 14px;
      z-index: 9999999;
      box-shadow: 0 8px 24px rgba(102, 126, 234, 0.4);
      animation: slideInRight 0.3s ease;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;

    document.body.appendChild(notification);

    setTimeout(() => {
      notification.style.animation = 'slideOutRight 0.3s ease';
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }

  private showErrorNotification(message: string): void {
    const notification = document.createElement('div');
    notification.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px;">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
        <div>${message}</div>
      </div>
    `;

    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 16px 20px;
      background: #ef4444;
      color: white;
      border-radius: 8px;
      font-size: 14px;
      z-index: 9999999;
      box-shadow: 0 8px 24px rgba(239, 68, 68, 0.4);
      animation: slideInRight 0.3s ease;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;

    document.body.appendChild(notification);

    setTimeout(() => {
      notification.style.animation = 'slideOutRight 0.3s ease';
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }
}

const autofill = new EmailAutofill();
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => autofill.initialize());
} else {
  autofill.initialize();
}

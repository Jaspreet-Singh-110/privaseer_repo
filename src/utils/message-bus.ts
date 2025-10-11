import { logger } from './logger';
import type { MessageType, Message, MessageHandler } from '../types';

class MessageBus {
  private handlers = new Map<MessageType, MessageHandler[]>();
  private pendingRequests = new Map<string, {
    resolve: (value: any) => void;
    reject: (error: any) => void;
    timeout: number;
  }>();
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message, sender)
        .then(sendResponse)
        .catch(error => {
          logger.error('MessageBus', 'Message handler error', error);
          sendResponse({ success: false, error: error.message });
        });
      return true;
    });

    this.initialized = true;
    logger.info('MessageBus', 'Message bus initialized');
  }

  on<T = any>(type: MessageType, handler: MessageHandler<T>): void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, []);
    }
    this.handlers.get(type)!.push(handler);
    logger.debug('MessageBus', `Handler registered for ${type}`);
  }

  off(type: MessageType, handler: MessageHandler): void {
    const handlers = this.handlers.get(type);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
        logger.debug('MessageBus', `Handler unregistered for ${type}`);
      }
    }
  }

  async send<T = any>(type: MessageType, data?: any, timeout = 5000): Promise<T> {
    const requestId = `${type}_${Date.now()}_${Math.random()}`;
    const message: Message = {
      type,
      data,
      requestId,
      timestamp: Date.now(),
    };

    logger.debug('MessageBus', `Sending message: ${type}`, { requestId, data });

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        const error = new Error(`Message timeout: ${type}`);
        logger.warn('MessageBus', `Message timeout: ${type}`, { requestId });
        reject(error);
      }, timeout) as unknown as number;

      this.pendingRequests.set(requestId, {
        resolve,
        reject,
        timeout: timeoutId,
      });

      chrome.runtime.sendMessage(message, response => {
        const pending = this.pendingRequests.get(requestId);
        if (pending) {
          clearTimeout(pending.timeout);
          this.pendingRequests.delete(requestId);

          if (chrome.runtime.lastError) {
            logger.error('MessageBus', 'Runtime error', chrome.runtime.lastError);
            reject(chrome.runtime.lastError);
          } else if (response?.success === false) {
            reject(new Error(response.error || 'Unknown error'));
          } else {
            logger.debug('MessageBus', `Received response for ${type}`, { requestId });
            resolve(response);
          }
        }
      });
    });
  }

  broadcast(type: MessageType, data?: any): void {
    const message: Message = {
      type,
      data,
      timestamp: Date.now(),
    };

    logger.debug('MessageBus', `Broadcasting: ${type}`, data);

    chrome.runtime.sendMessage(message).catch(error => {
      logger.debug('MessageBus', 'Broadcast failed (popup may be closed)', error);
    });

    chrome.tabs.query({}, tabs => {
      tabs.forEach(tab => {
        if (tab.id) {
          chrome.tabs.sendMessage(tab.id, message).catch(() => {
            // Content script may not be loaded, ignore
          });
        }
      });
    });
  }

  private async handleMessage(
    message: Message,
    sender: chrome.runtime.MessageSender
  ): Promise<any> {
    logger.debug('MessageBus', `Handling message: ${message.type}`, {
      from: sender.tab?.id ? `tab ${sender.tab.id}` : 'extension',
    });

    const handlers = this.handlers.get(message.type);
    if (!handlers || handlers.length === 0) {
      logger.warn('MessageBus', `No handler for message type: ${message.type}`);
      return { success: false, error: `No handler for ${message.type}` };
    }

    try {
      const results = await Promise.all(
        handlers.map(handler => handler(message.data, sender))
      );
      return results[results.length - 1] || { success: true };
    } catch (error) {
      logger.error('MessageBus', `Error handling ${message.type}`, error);
      throw error;
    }
  }

  getPendingRequestCount(): number {
    return this.pendingRequests.size;
  }

  clearPendingRequests(): void {
    this.pendingRequests.forEach(({ reject, timeout }) => {
      clearTimeout(timeout);
      reject(new Error('Request cleared'));
    });
    this.pendingRequests.clear();
    logger.info('MessageBus', 'Cleared all pending requests');
  }
}

export const messageBus = new MessageBus();

export type { MessageType, Message, MessageHandler };

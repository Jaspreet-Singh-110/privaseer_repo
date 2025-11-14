import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock Chrome APIs
global.chrome = {
  runtime: {
    sendMessage: vi.fn(),
    onMessage: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
    getManifest: vi.fn(() => ({
      version: '1.0.0',
      name: 'Privaseer',
    })),
    id: 'test-extension-id',
  },
  storage: {
    local: {
      get: vi.fn((keys, callback) => callback?.({})),
      set: vi.fn((items, callback) => callback?.()),
      remove: vi.fn((keys, callback) => callback?.()),
      clear: vi.fn((callback) => callback?.()),
    },
    sync: {
      get: vi.fn((keys, callback) => callback?.({})),
      set: vi.fn((items, callback) => callback?.()),
    },
  },
  tabs: {
    query: vi.fn((queryInfo, callback) => callback?.([])),
    get: vi.fn((tabId, callback) => callback?.({})),
    sendMessage: vi.fn(),
    onCreated: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
    onUpdated: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
    onActivated: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
    onRemoved: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
  },
  declarativeNetRequest: {
    updateDynamicRules: vi.fn((options, callback) => callback?.()),
    getDynamicRules: vi.fn((callback) => callback?.([])),
    updateEnabledRulesets: vi.fn(),
    getEnabledRulesets: vi.fn(),
  },
  action: {
    setBadgeText: vi.fn(),
    setBadgeBackgroundColor: vi.fn(),
  },
} as any;

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock IntersectionObserver
global.IntersectionObserver = class IntersectionObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  takeRecords() {
    return [];
  }
  unobserve() {}
} as any;

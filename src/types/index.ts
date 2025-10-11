export interface Alert {
  id: string;
  type: 'tracker_blocked' | 'non_compliant_site' | 'high_risk';
  severity: 'low' | 'medium' | 'high';
  message: string;
  domain: string;
  timestamp: number;
  url?: string;
}

export interface PrivacyScore {
  current: number;
  daily: {
    trackersBlocked: number;
    cleanSitesVisited: number;
    nonCompliantSites: number;
  };
  history: Array<{
    date: string;
    score: number;
    trackersBlocked: number;
  }>;
}

export interface TrackerData {
  domain: string;
  category: string;
  isHighRisk: boolean;
  blockedCount: number;
  lastBlocked: number;
}

export interface ConsentScanResult {
  url: string;
  hasBanner: boolean;
  hasRejectButton: boolean;
  isCompliant: boolean;
  deceptivePatterns: string[];
  timestamp: number;
}

export interface StorageData {
  privacyScore: PrivacyScore;
  alerts: Alert[];
  trackers: Record<string, TrackerData>;
  settings: {
    protectionEnabled: boolean;
    showNotifications: boolean;
  };
  lastReset: number;
  penalizedDomains?: Record<string, number>; // Persist penalty cooldowns across service worker restarts
}

export type MessageType =
  | 'STATE_UPDATE'
  | 'GET_STATE'
  | 'TOGGLE_PROTECTION'
  | 'CONSENT_SCAN_RESULT'
  | 'GET_TRACKER_INFO'
  | 'TRACKER_BLOCKED'
  | 'TAB_ACTIVATED'
  | 'TAB_UPDATED'
  | 'EXTENSION_READY';

// Message data types for type-safe messaging
export interface GetTrackerInfoData {
  domain: string;
}

export interface GetTrackerInfoResponse {
  success: boolean;
  info?: {
    description: string;
    alternative: string;
  };
  error?: string;
}

export interface GetStateResponse {
  success: boolean;
  data?: StorageData;
  error?: string;
}

export interface ToggleProtectionResponse {
  success: boolean;
  enabled?: boolean;
  error?: string;
}

export interface MessageResponse {
  success: boolean;
  error?: string;
  [key: string]: unknown;
}

// Map of message types to their data types
export interface MessageDataMap {
  STATE_UPDATE: undefined;
  GET_STATE: undefined;
  TOGGLE_PROTECTION: undefined;
  CONSENT_SCAN_RESULT: ConsentScanResult;
  GET_TRACKER_INFO: GetTrackerInfoData;
  TRACKER_BLOCKED: undefined;
  TAB_ACTIVATED: undefined;
  TAB_UPDATED: undefined;
  EXTENSION_READY: undefined;
}

export interface Message<T = unknown> {
  type: MessageType;
  data?: T;
  requestId?: string;
  timestamp?: number;
}

export interface MessageHandler<T = unknown> {
  (data: T, sender: chrome.runtime.MessageSender): Promise<unknown> | unknown;
}

// Backward compatibility alias
export type MessagePayload = Message;

export interface TrackerLists {
  version: string;
  lastUpdated: string;
  categories: {
    analytics: string[];
    advertising: string[];
    social: string[];
    fingerprinting: string[];
    beacons: string[];
  };
  highRisk: string[];
}

export interface PrivacyRules {
  version: string;
  cookieBannerSelectors: string[];
  rejectButtonPatterns: string[];
  acceptButtonPatterns: string[];
  complianceChecks: {
    rejectButtonRequired: boolean;
    rejectButtonVisibleWithoutScroll: boolean;
    equalProminence: boolean;
    noPreCheckedBoxes: boolean;
    explicitConsent: boolean;
  };
  deceptivePatterns: Array<{
    name: string;
    description: string;
    severity: string;
    penalty: number;
  }>;
}

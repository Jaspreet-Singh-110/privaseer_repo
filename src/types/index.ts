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

export interface Message<T = any> {
  type: MessageType;
  data?: T;
  requestId?: string;
  timestamp?: number;
}

export interface MessageHandler<T = any> {
  (data: T, sender: chrome.runtime.MessageSender): Promise<any> | any;
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

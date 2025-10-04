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

export interface MessagePayload {
  type: 'TRACKER_BLOCKED' | 'CONSENT_SCAN_RESULT' | 'GET_STATE' | 'TOGGLE_PROTECTION' | 'STATE_UPDATE';
  data?: any;
}

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

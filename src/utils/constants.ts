export const STORAGE_KEY = 'privacyData' as const;

export const RULESET_ID = 'tracker_blocklist' as const;

export const PRIVACY_SCORE = {
  MAX: 100,
  MIN: 0,
  INITIAL: 100,
  TRACKER_PENALTY: -1,
  CLEAN_SITE_REWARD: 2,
  NON_COMPLIANT_PENALTY: -5,
} as const;

export const TIME = {
  ONE_DAY_MS: 24 * 60 * 60 * 1000,
  FIVE_SECONDS_MS: 5000,
  TWO_SECONDS_MS: 2000,
  POPUP_REFRESH_INTERVAL_MS: 2000,
} as const;

export const LIMITS = {
  MAX_ALERTS: 100,
  MAX_HISTORY_DAYS: 30,
  ALERTS_DISPLAY_COUNT: 20,
} as const;

export const BADGE = {
  BACKGROUND_COLOR: '#DC2626',
} as const;

export const SCANNER = {
  INITIAL_SCAN_DELAY_MS: 2000,
  MUTATION_DEBOUNCE_MS: 500,
} as const;

import { logger } from './logger';
import { toError } from './type-guards';

export interface CMPDetectionResult {
  detected: boolean;
  cmpType: string;
  detectionMethod: 'cookie' | 'api' | 'banner' | 'hybrid';
  confidenceScore: number;
  consentStatus?: 'accepted' | 'rejected' | 'partial' | 'unknown';
  cookieNames: string[];
  tcfVersion?: string;
  hasRejectButton?: boolean;
}

interface CMPConfig {
  name: string;
  cookiePatterns: string[];
  apiDetectors: (() => Promise<CMPDetectionResult | null>)[];
  bannerSelectors: string[];
}

const CMP_CONFIGS: Record<string, CMPConfig> = {
  onetrust: {
    name: 'OneTrust',
    cookiePatterns: ['OptanonConsent', 'OptanonAlertBoxClosed', 'eupubconsent-v2'],
    apiDetectors: [detectOneTrustAPI],
    bannerSelectors: ['#onetrust-banner-sdk', '.onetrust-banner', '[data-onetrust]'],
  },
  cookiebot: {
    name: 'Cookiebot',
    cookiePatterns: ['CookieConsent', 'CookieConsentBulkSetting'],
    apiDetectors: [detectCookiebotAPI],
    bannerSelectors: ['#CybotCookiebotDialog', '[data-cookieconsent]'],
  },
  termly: {
    name: 'Termly',
    cookiePatterns: ['t_privacy_consent', 't_cookie_consent'],
    apiDetectors: [detectTermlyAPI],
    bannerSelectors: ['[data-termly]', '#termly-code-snippet-support'],
  },
  cookiecontrol: {
    name: 'CookieControl',
    cookiePatterns: ['CookieControl'],
    apiDetectors: [],
    bannerSelectors: ['[data-cc-banner]', '.ccc-widget'],
  },
  quantcast: {
    name: 'Quantcast',
    cookiePatterns: ['__qca', 'euconsent-v2'],
    apiDetectors: [detectTCFv2API],
    bannerSelectors: ['[data-qc-cmp]'],
  },
};

async function detectOneTrustAPI(): Promise<CMPDetectionResult | null> {
  try {
    if (typeof window === 'undefined' || !(window as any).OneTrust) {
      return null;
    }

    const OneTrust = (window as any).OneTrust;
    const activeGroups = OneTrust.GetDomainData?.()?.Groups || [];

    let consentStatus: 'accepted' | 'rejected' | 'partial' | 'unknown' = 'unknown';
    const acceptedGroups = activeGroups.filter((g: any) => g.Status === 'active');

    if (acceptedGroups.length === 0) {
      consentStatus = 'rejected';
    } else if (acceptedGroups.length === activeGroups.length) {
      consentStatus = 'accepted';
    } else {
      consentStatus = 'partial';
    }

    return {
      detected: true,
      cmpType: 'onetrust',
      detectionMethod: 'api',
      confidenceScore: 1.0,
      consentStatus,
      cookieNames: getCookiesByPattern(CMP_CONFIGS.onetrust.cookiePatterns),
    };
  } catch (error) {
    logger.debug('CMPDetector', 'OneTrust API detection failed', { error: toError(error).message });
    return null;
  }
}

async function detectCookiebotAPI(): Promise<CMPDetectionResult | null> {
  try {
    if (typeof window === 'undefined' || !(window as any).Cookiebot) {
      return null;
    }

    const Cookiebot = (window as any).Cookiebot;
    let consentStatus: 'accepted' | 'rejected' | 'partial' | 'unknown' = 'unknown';

    if (Cookiebot.declined === true) {
      consentStatus = 'rejected';
    } else if (Cookiebot.consent?.statistics && Cookiebot.consent?.marketing) {
      consentStatus = 'accepted';
    } else if (Cookiebot.consent?.necessary) {
      consentStatus = 'partial';
    }

    return {
      detected: true,
      cmpType: 'cookiebot',
      detectionMethod: 'api',
      confidenceScore: 1.0,
      consentStatus,
      cookieNames: getCookiesByPattern(CMP_CONFIGS.cookiebot.cookiePatterns),
    };
  } catch (error) {
    logger.debug('CMPDetector', 'Cookiebot API detection failed', { error: toError(error).message });
    return null;
  }
}

async function detectTermlyAPI(): Promise<CMPDetectionResult | null> {
  try {
    if (typeof window === 'undefined' || !(window as any).termly) {
      return null;
    }

    return {
      detected: true,
      cmpType: 'termly',
      detectionMethod: 'api',
      confidenceScore: 0.9,
      consentStatus: 'unknown',
      cookieNames: getCookiesByPattern(CMP_CONFIGS.termly.cookiePatterns),
    };
  } catch (error) {
    logger.debug('CMPDetector', 'Termly API detection failed', { error: toError(error).message });
    return null;
  }
}

async function detectTCFv2API(): Promise<CMPDetectionResult | null> {
  return new Promise((resolve) => {
    try {
      if (typeof window === 'undefined' || !(window as any).__tcfapi) {
        resolve(null);
        return;
      }

      (window as any).__tcfapi('getTCData', 2, (tcData: any, success: boolean) => {
        if (!success || !tcData) {
          resolve(null);
          return;
        }

        let consentStatus: 'accepted' | 'rejected' | 'partial' | 'unknown' = 'unknown';

        if (tcData.purpose?.consents) {
          const consents = Object.values(tcData.purpose.consents);
          const totalConsents = consents.length;
          const acceptedConsents = consents.filter((c: any) => c === true).length;

          if (acceptedConsents === 0) {
            consentStatus = 'rejected';
          } else if (acceptedConsents === totalConsents) {
            consentStatus = 'accepted';
          } else {
            consentStatus = 'partial';
          }
        }

        resolve({
          detected: true,
          cmpType: tcData.cmpId ? `tcfv2-${tcData.cmpId}` : 'tcfv2',
          detectionMethod: 'api',
          confidenceScore: 1.0,
          consentStatus,
          cookieNames: ['euconsent-v2'],
          tcfVersion: '2.0',
        });
      });

      setTimeout(() => resolve(null), 1000);
    } catch (error) {
      logger.debug('CMPDetector', 'TCF v2 API detection failed', { error: toError(error).message });
      resolve(null);
    }
  });
}

function getCookiesByPattern(patterns: string[]): string[] {
  const cookies = document.cookie.split(';');
  const matchedCookies: string[] = [];

  for (const cookie of cookies) {
    const cookieName = cookie.trim().split('=')[0];
    for (const pattern of patterns) {
      if (cookieName.includes(pattern)) {
        matchedCookies.push(cookieName);
        break;
      }
    }
  }

  return matchedCookies;
}

function detectCMPByBanner(cmpType: string, config: CMPConfig): CMPDetectionResult | null {
  for (const selector of config.bannerSelectors) {
    try {
      const element = document.querySelector(selector);
      if (element) {
        return {
          detected: true,
          cmpType,
          detectionMethod: 'banner',
          confidenceScore: 0.7,
          consentStatus: 'unknown',
          cookieNames: getCookiesByPattern(config.cookiePatterns),
        };
      }
    } catch (error) {
      continue;
    }
  }
  return null;
}

function detectCMPByCookie(cmpType: string, config: CMPConfig): CMPDetectionResult | null {
  const matchedCookies = getCookiesByPattern(config.cookiePatterns);

  if (matchedCookies.length > 0) {
    return {
      detected: true,
      cmpType,
      detectionMethod: 'cookie',
      confidenceScore: 0.8,
      consentStatus: 'unknown',
      cookieNames: matchedCookies,
    };
  }

  return null;
}

export async function detectCMP(): Promise<CMPDetectionResult> {
  const defaultResult: CMPDetectionResult = {
    detected: false,
    cmpType: 'unknown',
    detectionMethod: 'cookie',
    confidenceScore: 0,
    consentStatus: 'unknown',
    cookieNames: [],
  };

  try {
    for (const [cmpType, config] of Object.entries(CMP_CONFIGS)) {
      for (const apiDetector of config.apiDetectors) {
        const apiResult = await apiDetector();
        if (apiResult) {
          logger.info('CMPDetector', 'CMP detected via API', { cmpType, confidenceScore: apiResult.confidenceScore });
          return apiResult;
        }
      }

      const cookieResult = detectCMPByCookie(cmpType, config);
      if (cookieResult) {
        const bannerResult = detectCMPByBanner(cmpType, config);
        if (bannerResult) {
          logger.info('CMPDetector', 'CMP detected via hybrid', { cmpType });
          return {
            ...cookieResult,
            detectionMethod: 'hybrid',
            confidenceScore: 0.9,
          };
        }
        logger.info('CMPDetector', 'CMP detected via cookie', { cmpType });
        return cookieResult;
      }

      const bannerResult = detectCMPByBanner(cmpType, config);
      if (bannerResult) {
        logger.info('CMPDetector', 'CMP detected via banner', { cmpType });
        return bannerResult;
      }
    }

    const tcfResult = await detectTCFv2API();
    if (tcfResult) {
      logger.info('CMPDetector', 'CMP detected via TCF v2', { cmpType: tcfResult.cmpType });
      return tcfResult;
    }

    logger.debug('CMPDetector', 'No CMP detected');
    return defaultResult;
  } catch (error) {
    logger.error('CMPDetector', 'Error during CMP detection', toError(error));
    return defaultResult;
  }
}

export function hasValidPersistedConsent(cmpResult: CMPDetectionResult): boolean {
  if (!cmpResult.detected) {
    return false;
  }

  if (cmpResult.cookieNames.length === 0) {
    return false;
  }

  if (cmpResult.consentStatus === 'unknown') {
    return false;
  }

  if (cmpResult.confidenceScore < 0.7) {
    return false;
  }

  return true;
}

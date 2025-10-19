import React, { useEffect, useState, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { Shield, ShieldOff, Activity, AlertTriangle, CheckCircle2, XCircle, Info, MessageSquare, X, Send } from 'lucide-react';
import type { StorageData, Alert as AlertType, Message } from '../types';
import { logger } from '../utils/logger';
import { toError } from '../utils/type-guards';
import '../index.css';

function PrivacyScoreMeter({ score }: { score: number }) {
  const [animatedScore, setAnimatedScore] = useState(0);
  const animationRef = useRef<number>();
  const pathRef = useRef<SVGPathElement>(null);

  const scoreColor = score >= 80 ? '#16a34a' : score >= 60 ? '#d97706' : '#dc2626';
  const scoreColorLight = score >= 80 ? '#22c55e' : score >= 60 ? '#f59e0b' : '#ef4444';
  const radius = 80;
  const strokeWidth = 12;
  const normalizedRadius = radius - strokeWidth / 2;
  // Semi-circle arc length - increase to account for rounded caps filling to 100%
  const circumference = normalizedRadius * Math.PI * 1.10;

  useEffect(() => {
    // Set initial state immediately
    if (pathRef.current) {
      pathRef.current.style.strokeDashoffset = `${circumference}`;
    }

    let startTime: number;
    const duration = 1500; // 1.5 seconds animation

    const animate = (currentTime: number) => {
      if (!startTime) startTime = currentTime;
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Easing function for smooth animation
      const easeOutCubic = 1 - Math.pow(1 - progress, 3);
      const currentScore = Math.floor(easeOutCubic * score);

      setAnimatedScore(currentScore);

      // Update path directly
      if (pathRef.current) {
        const offset = circumference - (currentScore / 100) * circumference;
        pathRef.current.style.strokeDashoffset = `${offset}`;
      }

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      }
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [score, circumference]);

  return (
    <div className="relative flex flex-col items-center" style={{ height: '110px' }}>
      <svg
        height={radius + strokeWidth + 10}
        width={(radius + strokeWidth) * 2}
        style={{ overflow: 'visible' }}
      >
        {/* Background arc */}
        <path
          d={`M ${strokeWidth / 2} ${radius + strokeWidth / 2} A ${normalizedRadius} ${normalizedRadius} 0 0 1 ${radius * 2 + strokeWidth / 2} ${radius + strokeWidth / 2}`}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        {/* Animated score arc */}
        <path
          ref={pathRef}
          d={`M ${strokeWidth / 2} ${radius + strokeWidth / 2} A ${normalizedRadius} ${normalizedRadius} 0 0 1 ${radius * 2 + strokeWidth / 2} ${radius + strokeWidth / 2}`}
          fill="none"
          stroke={`url(#gradient-${score})`}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeLinecap="round"
          style={{
            strokeDashoffset: circumference,
            filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))'
          }}
        />
        {/* Gradient definition */}
        <defs>
          <linearGradient id={`gradient-${score}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" style={{ stopColor: scoreColor, stopOpacity: 0.8 }} />
            <stop offset="100%" style={{ stopColor: scoreColorLight, stopOpacity: 1 }} />
          </linearGradient>
        </defs>
      </svg>

      {/* Score display in center */}
      <div className="absolute" style={{ top: '45px', left: '50%', transform: 'translateX(-50%)' }}>
        <div className="flex flex-col items-center">
          <div className="flex items-baseline">
            <span className="text-4xl font-bold" style={{ color: scoreColor }}>
              {animatedScore}
            </span>
            <span className="text-lg font-medium text-gray-400 ml-1">/100</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Popup() {
  const [data, setData] = useState<StorageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedAlerts, setExpandedAlerts] = useState<Set<string>>(new Set());
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const [showSuccessBanner, setShowSuccessBanner] = useState(false);
  const [currentTab, setCurrentTab] = useState<chrome.tabs.Tab | null>(null);
  const [showProtectionToast, setShowProtectionToast] = useState(false);
  const [protectionToastMessage, setProtectionToastMessage] = useState('');
  const [protectionToastState, setProtectionToastState] = useState(false);
  const [isTogglingProtection, setIsTogglingProtection] = useState(false);

  useEffect(() => {
    checkCurrentTab();
    loadData();

    const listener = (message: Message) => {
      if (message.type === 'STATE_UPDATE') {
        loadData();
      }
    };

    chrome.runtime.onMessage.addListener(listener);

    const interval = setInterval(() => {
      if (!data) {
        loadData();
      }
    }, 2000);

    return () => {
      chrome.runtime.onMessage.removeListener(listener);
      clearInterval(interval);
    };
  }, [data]);

  const checkCurrentTab = async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      setCurrentTab(tab);
    } catch (error) {
      logger.error('Popup', 'Failed to get current tab', toError(error));
    }
  };

  const loadData = async () => {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
      if (response && response.success) {
        setData(response.data);
      }
    } catch (error) {
      const err = toError(error);
      const errorMessage = err.message;
      if (errorMessage.includes('Could not establish connection') ||
          errorMessage.includes('Receiving end does not exist')) {
        logger.debug('Popup', 'Service worker not ready yet');
      } else {
        logger.error('Popup', 'Failed to load data', err);
      }
    } finally {
      setLoading(false);
    }
  };

  const toggleProtection = async () => {
    if (isTogglingProtection) return;

    setIsTogglingProtection(true);

    const timeout = setTimeout(() => {
      setIsTogglingProtection(false);
      logger.warn('Popup', 'Toggle protection timed out');
    }, 5000);

    try {
      const response = await chrome.runtime.sendMessage({ type: 'TOGGLE_PROTECTION' });
      clearTimeout(timeout);

      console.log('Toggle response:', response);

      if (response && response.success) {
        const newState = response.enabled;
        console.log('New protection state:', newState);

        await loadData();

        setProtectionToastState(newState);
        setProtectionToastMessage(newState ? 'Protection Enabled' : 'Protection Paused');
        setShowProtectionToast(true);
        setTimeout(() => setShowProtectionToast(false), 3000);

        logger.info('Popup', 'Protection toggled', { enabled: newState });
      }
    } catch (error) {
      clearTimeout(timeout);
      console.error('Toggle error:', error);
      const err = toError(error);
      const errorMessage = err.message;
      if (errorMessage.includes('Could not establish connection') ||
          errorMessage.includes('Receiving end does not exist')) {
        logger.debug('Popup', 'Service worker not ready for toggle');
      } else {
        logger.error('Popup', 'Failed to toggle protection', err);
      }
    } finally {
      setIsTogglingProtection(false);
    }
  };

  const toggleExpanded = (alertId: string) => {
    setExpandedAlerts((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(alertId)) {
        newSet.delete(alertId);
      } else {
        newSet.add(alertId);
      }
      return newSet;
    });
  };

  const handleFeedbackSubmit = async () => {
    try {
      const timestamp = new Date().toISOString();
      
      // Extract domain from current tab URL
      const getDomain = (url?: string): string => {
        if (!url) return 'unknown';
        try {
          return new URL(url).hostname;
        } catch {
          return 'unknown';
        }
      };
      
      const feedbackEntry = {
        text: feedbackText,
        timestamp,
        url: currentTab?.url || 'unknown',
        domain: getDomain(currentTab?.url)
      };

      const result = await chrome.storage.local.get('userFeedback');
      const existingFeedback = result.userFeedback || [];
      existingFeedback.push(feedbackEntry);

      await chrome.storage.local.set({ userFeedback: existingFeedback });

      logger.info('User feedback stored', { timestamp, domain: feedbackEntry.domain });

      setShowFeedbackModal(false);
      setFeedbackText('');
      setShowSuccessBanner(true);
      setTimeout(() => setShowSuccessBanner(false), 3000);
    } catch (error) {
      logger.error('Failed to store feedback', toError(error));
    }
  };

  if (loading || !data) {
    return (
      <div className="w-full h-[500px] flex items-center justify-center bg-gray-50">
        <Activity className="w-6 h-6 animate-spin text-blue-600" />
      </div>
    );
  }

  const isValidWebPage = currentTab?.url &&
    (currentTab.url.startsWith('http://') || currentTab.url.startsWith('https://'));

  if (!isValidWebPage) {
    return (
      <div className="w-full h-[500px] flex flex-col bg-white">
        <div className="px-6 py-8 flex flex-col items-center justify-center flex-1">
          <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mb-4">
            <Shield className="w-8 h-8 text-blue-600" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Privaseer</h3>
          <p className="text-sm text-gray-600 text-center max-w-xs mb-6">
            Open this extension on a website to see privacy insights and tracker blocking.
          </p>
          <div className="text-xs text-gray-500 bg-gray-50 px-4 py-2 rounded-lg">
            Navigate to any http:// or https:// website
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
          <div className="flex items-center justify-between text-xs">
            <button
              onClick={() => setShowFeedbackModal(true)}
              className="flex items-center gap-1.5 text-blue-600 hover:text-blue-700 font-medium transition-colors"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Send Feedback</span>
            </button>
            <span className="text-gray-500">v{__APP_VERSION__}</span>
          </div>
        </div>

        {showFeedbackModal && (
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md transform transition-all">
              <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">Send Feedback</h3>
                <button
                  onClick={() => {
                    setShowFeedbackModal(false);
                    setFeedbackText('');
                  }}
                  className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>

              <div className="p-6">
                <p className="text-sm text-gray-600 mb-4">
                  Help us improve Privaseer. Share your thoughts, report issues, or suggest features.
                </p>
                <textarea
                  value={feedbackText}
                  onChange={(e) => setFeedbackText(e.target.value)}
                  placeholder="Type your feedback here..."
                  className="w-full h-32 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none text-sm transition-all"
                  autoFocus
                />
              </div>

              <div className="px-6 py-4 bg-gray-50 rounded-b-xl flex items-center justify-end gap-3">
                <button
                  onClick={() => {
                    setShowFeedbackModal(false);
                    setFeedbackText('');
                  }}
                  className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleFeedbackSubmit}
                  disabled={!feedbackText.trim()}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed rounded-lg transition-colors flex items-center gap-2"
                >
                  <Send className="w-4 h-4" />
                  Submit
                </button>
              </div>
            </div>
          </div>
        )}

        {showSuccessBanner && (
          <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-50 animate-fade-in">
            <div className="bg-gradient-to-r from-green-500 to-emerald-600 text-white px-6 py-3 rounded-lg shadow-2xl flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5" />
              <div>
                <p className="font-semibold text-sm">Feedback Submitted!</p>
                <p className="text-xs text-green-100">Thank you for helping us improve</p>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  const score = data.privacyScore.current;
  const scoreColor = score >= 80 ? 'text-green-600' : score >= 60 ? 'text-amber-600' : 'text-red-600';
  const scoreBg = score >= 80 ? 'bg-green-50' : score >= 60 ? 'bg-amber-50' : 'bg-red-50';
  const scoreLabel = score >= 80 ? 'Excellent' : score >= 60 ? 'Good' : score >= 40 ? 'Fair' : 'Poor';

  return (
    <div className="w-full h-[600px] flex flex-col bg-white">
      <div className={`px-6 py-5 ${scoreBg} border-b border-gray-200`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-blue-600" />
            <h1 className="text-lg font-bold text-gray-900">Privaseer</h1>
          </div>
          <button
            onClick={toggleProtection}
            disabled={isTogglingProtection}
            className={`p-2 rounded-lg transition-colors ${
              isTogglingProtection
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : data.settings.protectionEnabled
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
            }`}
            title={isTogglingProtection ? 'Processing...' : data.settings.protectionEnabled ? 'Protection Enabled' : 'Protection Paused'}
          >
            {isTogglingProtection ? (
              <Activity className="w-4 h-4 animate-spin" />
            ) : data.settings.protectionEnabled ? (
              <Shield className="w-4 h-4" />
            ) : (
              <ShieldOff className="w-4 h-4" />
            )}
          </button>
        </div>

        <div className="flex items-center justify-center mb-3">
          <PrivacyScoreMeter score={score} />
        </div>

        <div className="text-center mb-3">
          <span className={`text-sm font-semibold ${scoreColor}`}>{scoreLabel} Privacy</span>
        </div>

        <div className="flex items-center justify-center gap-4 text-sm text-gray-600">
          <div className="flex items-center gap-1">
            <XCircle className="w-4 h-4" />
            <span className="font-semibold">{data.privacyScore.daily.trackersBlocked}</span>
            <span>blocked today</span>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col">
        <div className="px-6 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">Recent Activity</h2>
          {data.alerts.length > 0 && (
            <button
              onClick={async () => {
                try {
                  await chrome.runtime.sendMessage({ type: 'CLEAR_ALERTS' });
                  await loadData();
                } catch (error) {
                  logger.error('Popup', 'Failed to clear alerts', toError(error));
                }
              }}
              className="text-xs text-gray-500 hover:text-red-600 font-medium transition-colors"
            >
              Clear All
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {data.alerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400 px-6 text-center">
              <CheckCircle2 className="w-12 h-12 mb-3" />
              <p className="text-sm">No activity yet</p>
              <p className="text-xs mt-1">Browse the web to see protection in action</p>
            </div>
          ) : (
            data.alerts.map((alert) => (
              <AlertItem
                key={alert.id}
                alert={alert}
                isExpanded={expandedAlerts.has(alert.id)}
                onToggleExpanded={() => toggleExpanded(alert.id)}
              />
            ))
          )}
        </div>
      </div>

      <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
        <div className="flex items-center justify-between text-xs">
          <button
            onClick={() => setShowFeedbackModal(true)}
            className="flex items-center gap-1.5 text-blue-600 hover:text-blue-700 font-medium transition-colors"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Send Feedback</span>
          </button>
          <span className="text-gray-500">v2.4.0</span>
        </div>
      </div>

      {showFeedbackModal && (
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md transform transition-all">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Send Feedback</h3>
              <button
                onClick={() => {
                  setShowFeedbackModal(false);
                  setFeedbackText('');
                }}
                className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="p-6">
              <p className="text-sm text-gray-600 mb-4">
                Help us improve Privaseer. Share your thoughts, report issues, or suggest features.
              </p>
              <textarea
                value={feedbackText}
                onChange={(e) => setFeedbackText(e.target.value)}
                placeholder="Type your feedback here..."
                className="w-full h-32 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none text-sm transition-all"
                autoFocus
              />
            </div>

            <div className="px-6 py-4 bg-gray-50 rounded-b-xl flex items-center justify-end gap-3">
              <button
                onClick={() => {
                  setShowFeedbackModal(false);
                  setFeedbackText('');
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleFeedbackSubmit}
                disabled={!feedbackText.trim()}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed rounded-lg transition-colors flex items-center gap-2"
              >
                <Send className="w-4 h-4" />
                Submit
              </button>
            </div>
          </div>
        </div>
      )}

      {showSuccessBanner && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-50 animate-fade-in">
          <div className="bg-gradient-to-r from-green-500 to-emerald-600 text-white px-6 py-3 rounded-lg shadow-2xl flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5" />
            <div>
              <p className="font-semibold text-sm">Feedback Submitted!</p>
              <p className="text-xs text-green-100">Thank you for helping us improve</p>
            </div>
          </div>
        </div>
      )}

      {showProtectionToast && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-50 animate-fade-in">
          <div className={`${protectionToastState ? 'bg-gradient-to-r from-blue-500 to-blue-600' : 'bg-gradient-to-r from-gray-500 to-gray-600'} text-white px-6 py-3 rounded-lg shadow-2xl flex items-center gap-3`}>
            {protectionToastState ? (
              <Shield className="w-5 h-5" />
            ) : (
              <ShieldOff className="w-5 h-5" />
            )}
            <div>
              <p className="font-semibold text-sm">{protectionToastMessage}</p>
              <p className="text-xs opacity-90">
                {protectionToastState ? 'Trackers are now being blocked' : 'Trackers are not being blocked'}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AlertItem({
  alert,
  isExpanded,
  onToggleExpanded
}: {
  alert: AlertType;
  isExpanded: boolean;
  onToggleExpanded: () => void;
}) {
  const [trackerInfo, setTrackerInfo] = useState<{ description: string; alternative: string } | null>(null);
  const [loadingInfo, setLoadingInfo] = useState(false);

  const getSeverityIcon = () => {
    switch (alert.severity) {
      case 'high':
        return <div className="w-2 h-2 rounded-full bg-red-500" />;
      case 'medium':
        return <div className="w-2 h-2 rounded-full bg-amber-500" />;
      default:
        return <div className="w-2 h-2 rounded-full bg-green-500" />;
    }
  };

  const getTypeIcon = () => {
    switch (alert.type) {
      case 'high_risk':
        return <AlertTriangle className="w-4 h-4 text-red-600" />;
      case 'non_compliant_site':
        return <XCircle className="w-4 h-4 text-amber-600" />;
      default:
        return <Shield className="w-4 h-4 text-blue-600" />;
    }
  };

  const timeAgo = (timestamp: number) => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  const loadTrackerInfo = async () => {
    if (trackerInfo) {
      onToggleExpanded();
      return;
    }

    setLoadingInfo(true);
    try {
      const trackerDomain = alert.message.replace('Blocked ', '').trim();
      const response = await chrome.runtime.sendMessage({
        type: 'GET_TRACKER_INFO',
        data: { domain: trackerDomain }
      });

      if (response.success && response.info) {
        setTrackerInfo(response.info);
        onToggleExpanded();
      }
    } catch (error) {
      logger.error('Popup', 'Failed to load tracker info', toError(error));
    } finally {
      setLoadingInfo(false);
    }
  };

  const handleAlertClick = () => {
    if (isTrackerAlert) {
      loadTrackerInfo();
    }
    else if (isCookieBannerAlert) {
      onToggleExpanded();
    }
  };

  const isTrackerAlert = alert.type === 'tracker_blocked' || alert.type === 'high_risk';
  const isCookieBannerAlert = alert.type === 'non_compliant_site';
  const hasExpandableInfo = isTrackerAlert || (isCookieBannerAlert && alert.deceptivePatterns && alert.deceptivePatterns.length > 0);

  return (
    <div className="hover:bg-gray-50 transition-colors border-b border-gray-100">
      <div className="px-6 py-3 cursor-pointer" onClick={handleAlertClick}>
        <div className="flex items-start gap-3">
          <div className="mt-0.5">{getSeverityIcon()}</div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-2 mb-1">
              <div className="mt-0.5">{getTypeIcon()}</div>
              <span className={`text-xs font-medium text-gray-900 flex-1 ${isExpanded ? '' : 'truncate'}`}>
                {alert.message}
              </span>
              {hasExpandableInfo && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleAlertClick();
                  }}
                  className="p-1 hover:bg-gray-200 rounded transition-colors flex-shrink-0"
                  title={isTrackerAlert ? "Show tracker info" : "Show banner details"}
                  disabled={loadingInfo}
                >
                  {loadingInfo ? (
                    <Activity className="w-3 h-3 animate-spin text-gray-400" />
                  ) : (
                    <Info className="w-3 h-3 text-gray-400 hover:text-blue-600" />
                  )}
                </button>
              )}
            </div>
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span className="truncate">{alert.domain}</span>
              <span className="ml-2 whitespace-nowrap">{timeAgo(alert.timestamp)}</span>
            </div>
          </div>
        </div>
      </div>

      {isExpanded && trackerInfo && isTrackerAlert && (
        <div className="px-6 pb-3">
          <div className="ml-5 p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs">
            <div className="mb-2">
              <span className="font-semibold text-blue-900">What it does: </span>
              <span className="text-blue-800">{trackerInfo.description}</span>
            </div>
            <div>
              <span className="font-semibold text-blue-900">Alternative: </span>
              <span className="text-blue-800">{trackerInfo.alternative}</span>
            </div>
          </div>
        </div>
      )}

      {/* DISABLED: Consent scanning feature - Cookie banner alert details */}
      {/*
      {isExpanded && isCookieBannerAlert && alert.deceptivePatterns && alert.deceptivePatterns.length > 0 && (
        <div className="px-6 pb-3">
          <div className="ml-5 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs">
            <div className="mb-2">
              <span className="font-semibold text-amber-900">Banner Issues:</span>
            </div>
            <ul className="space-y-1 text-amber-800">
              {alert.deceptivePatterns.map((pattern, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="text-amber-600 mt-0.5">•</span>
                  <span>
                    {pattern === 'Forced Consent' && 'No reject button available - you must accept tracking'}
                    {pattern === 'Dark Pattern' && 'Accept button is more prominent than reject button'}
                    {pattern === 'Hidden Reject' && 'Reject button is hidden below the fold'}
                  </span>
                </li>
              ))}
            </ul>
            {alert.url && (
              <div className="mt-2 pt-2 border-t border-amber-200">
                <span className="font-semibold text-amber-900">URL: </span>
                <span className="text-amber-800 break-all">{alert.url}</span>
              </div>
            )}
          </div>
        </div>
      )}
      */}
    </div>
  );
}

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<Popup />);
}

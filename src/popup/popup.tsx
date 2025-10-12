import React, { useEffect, useState, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { Shield, ShieldOff, Activity, AlertTriangle, CheckCircle2, XCircle, Info } from 'lucide-react';
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

  useEffect(() => {
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
    try {
      const response = await chrome.runtime.sendMessage({ type: 'TOGGLE_PROTECTION' });
      if (response && response.success) {
        await loadData();
        logger.info('Popup', 'Protection toggled', { enabled: response.enabled });
      }
    } catch (error) {
      const err = toError(error);
      const errorMessage = err.message;
      if (errorMessage.includes('Could not establish connection') ||
          errorMessage.includes('Receiving end does not exist')) {
        logger.debug('Popup', 'Service worker not ready for toggle');
      } else {
        logger.error('Popup', 'Failed to toggle protection', err);
      }
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

  if (loading || !data) {
    return (
      <div className="w-full h-[500px] flex items-center justify-center bg-gray-50">
        <Activity className="w-6 h-6 animate-spin text-blue-600" />
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
            className={`p-2 rounded-lg transition-colors ${
              data.settings.protectionEnabled
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
            }`}
            title={data.settings.protectionEnabled ? 'Protection Enabled' : 'Protection Paused'}
          >
            {data.settings.protectionEnabled ? (
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
        <div className="px-6 py-3 border-b border-gray-200 bg-gray-50">
          <h2 className="text-sm font-semibold text-gray-700">Recent Activity</h2>
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
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>Local processing only</span>
          <span>v2.4.0</span>
        </div>
      </div>
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
    } else if (isCookieBannerAlert) {
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
    </div>
  );
}

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<Popup />);
}

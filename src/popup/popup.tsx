import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Shield, ShieldOff, Activity, AlertTriangle, CheckCircle2, XCircle, Info } from 'lucide-react';
import type { StorageData, Alert as AlertType, Message } from '../types';
import { logger } from '../utils/logger';
import { toError } from '../utils/type-guards';
import '../index.css';

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
      <div className={`px-6 py-6 ${scoreBg} border-b border-gray-200`}>
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

        <div className="flex items-center justify-center mb-2">
          <div className={`text-5xl font-bold ${scoreColor}`}>{score}</div>
          <div className="text-2xl font-medium text-gray-500 ml-1">/100</div>
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

  const isTrackerAlert = alert.type === 'tracker_blocked' || alert.type === 'high_risk';

  return (
    <div className="hover:bg-gray-50 transition-colors border-b border-gray-100">
      <div className="px-6 py-3">
        <div className="flex items-start gap-3">
          <div className="mt-0.5">{getSeverityIcon()}</div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              {getTypeIcon()}
              <span className="text-xs font-medium text-gray-900 truncate">{alert.message}</span>
              {isTrackerAlert && (
                <button
                  onClick={loadTrackerInfo}
                  className="ml-auto p-1 hover:bg-gray-200 rounded transition-colors flex-shrink-0"
                  title="Show tracker info"
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

      {isExpanded && trackerInfo && (
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
    </div>
  );
}

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<Popup />);
}

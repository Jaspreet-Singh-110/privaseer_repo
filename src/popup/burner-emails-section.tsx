import React, { useState, useEffect } from 'react';
import { Mail, Copy, Trash2, Plus, ExternalLink } from 'lucide-react';
import type { BurnerEmail } from '../types';
import { logger } from '../utils/logger';
import { toError } from '../utils/type-guards';

export function BurnerEmailsSection() {
  const [emails, setEmails] = useState<BurnerEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedEmail, setCopiedEmail] = useState<string | null>(null);

  useEffect(() => {
    loadEmails();
  }, []);

  const loadEmails = async () => {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_BURNER_EMAILS' });
      if (response.success) {
        setEmails(response.emails || []);
      }
    } catch (error) {
      logger.error('BurnerEmails', 'Failed to load emails', toError(error));
    } finally {
      setLoading(false);
    }
  };

  const copyEmail = async (email: string) => {
    try {
      await navigator.clipboard.writeText(email);
      setCopiedEmail(email);
      setTimeout(() => setCopiedEmail(null), 2000);
    } catch (error) {
      logger.error('BurnerEmails', 'Failed to copy email', toError(error));
    }
  };

  const deleteEmail = async (emailId: string) => {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'DELETE_BURNER_EMAIL',
        data: { emailId }
      });

      if (response.success) {
        setEmails(emails.filter(e => e.id !== emailId));
      }
    } catch (error) {
      logger.error('BurnerEmails', 'Failed to delete email', toError(error));
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-gray-200 rounded w-1/3"></div>
          <div className="h-16 bg-gray-100 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Mail className="w-5 h-5 text-blue-600" />
            Burner Emails
          </h3>
          <p className="text-xs text-gray-600 mt-1">
            Protected disposable emails for untrusted sites
          </p>
        </div>
      </div>

      {emails.length === 0 ? (
        <div className="text-center py-8 px-4 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border border-blue-100">
          <Mail className="w-12 h-12 mx-auto text-blue-400 mb-3" />
          <p className="text-sm font-medium text-gray-900 mb-1">No burner emails yet</p>
          <p className="text-xs text-gray-600 mb-4">
            Focus any email field on a website to generate one
          </p>
          <div className="flex items-center justify-center gap-2 text-xs text-blue-700 bg-blue-100 px-3 py-2 rounded-lg inline-flex">
            <Plus className="w-4 h-4" />
            <span>Click "Generate Burner Email" when you see it</span>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {emails.map((email) => (
            <div
              key={email.id}
              className="bg-white border border-gray-200 rounded-lg p-4 hover:border-blue-300 hover:shadow-sm transition-all group"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Mail className="w-4 h-4 text-blue-600 flex-shrink-0" />
                    <span className="text-sm font-mono font-medium text-gray-900 truncate">
                      {email.email}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-600">
                    <ExternalLink className="w-3 h-3" />
                    <span className="truncate">{email.domain}</span>
                    <span className="text-gray-400">•</span>
                    <span>{formatDate(email.created_at)}</span>
                  </div>
                  {email.label && (
                    <div className="mt-2 text-xs text-gray-700 bg-gray-50 px-2 py-1 rounded inline-block">
                      {email.label}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => copyEmail(email.email)}
                    className="p-2 hover:bg-blue-50 rounded-lg transition-colors group/copy"
                    title="Copy email"
                  >
                    {copiedEmail === email.email ? (
                      <svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <Copy className="w-4 h-4 text-gray-400 group-hover/copy:text-blue-600" />
                    )}
                  </button>
                  <button
                    onClick={() => deleteEmail(email.id)}
                    className="p-2 hover:bg-red-50 rounded-lg transition-colors group/delete"
                    title="Delete email"
                  >
                    <Trash2 className="w-4 h-4 text-gray-400 group-hover/delete:text-red-600" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="pt-2 border-t border-gray-200">
        <div className="text-xs text-gray-600 bg-gray-50 p-3 rounded-lg">
          <p className="font-medium text-gray-900 mb-1">How it works:</p>
          <ul className="space-y-1 ml-4 list-disc">
            <li>Click any email field on a website</li>
            <li>Click "Generate Burner Email" button</li>
            <li>Email is automatically filled in</li>
            <li>Your identity stays protected</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

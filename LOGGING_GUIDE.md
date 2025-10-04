# Privaseer Logging System Guide

## Overview

Privaseer v2.1 includes a comprehensive logging system that tracks everything happening in the extension. This helps with debugging, understanding user behavior (locally), and quickly fixing issues.

## Features

### 🎯 Log Levels

The logging system has 4 levels of severity:

1. **DEBUG** - Detailed information for developers
   - Only shown in development mode
   - Example: "Tab 123 loading", "Message sent"

2. **INFO** - General information about operations
   - Normal events that should be logged
   - Example: "Extension initialized", "Protection toggled"

3. **WARN** - Warning messages about potential issues
   - Something unusual but not broken
   - Example: "Message timeout", "Invalid domain"

4. **ERROR** - Error messages when something breaks
   - Includes full error details and stack traces
   - Example: "Failed to load data", "Storage error"

### 💾 Log Persistence

- **Automatic saving** - Logs are saved to local storage every 5 seconds
- **Maximum 500 logs** - Keeps last 500 log entries (oldest are removed)
- **7-day retention** - Logs older than 7 days are automatically deleted
- **Survives restarts** - Logs persist across browser restarts

### 📊 Log Structure

Each log entry contains:

```typescript
{
  timestamp: 1696435200000,           // Unix timestamp
  level: 'info',                      // debug, info, warn, error
  category: 'ServiceWorker',          // Component that logged it
  message: 'Extension initialized',   // Human-readable message
  data: { tabs: 5 },                  // Optional additional data
  error: 'Connection failed',         // Error message (if error level)
  stack: 'Error: Connection...'      // Stack trace (if error level)
}
```

## Usage Examples

### For Developers

#### Basic Logging

```typescript
import { logger } from '../utils/logger';

// Debug (development only)
logger.debug('MyComponent', 'Processing item', { itemId: 123 });

// Info
logger.info('MyComponent', 'Operation completed successfully');

// Warning
logger.warn('MyComponent', 'Retrying operation', { attempt: 2 });

// Error
logger.error('MyComponent', 'Operation failed', error, { context: 'data' });
```

#### Querying Logs

```typescript
// Get all logs
const allLogs = await logger.getLogs();

// Get only errors
const errors = await logger.getLogs('error');

// Get logs for specific component
const workerLogs = await logger.getLogs(undefined, 'ServiceWorker');

// Get last 50 logs
const recentLogs = await logger.getLogs(undefined, undefined, 50);
```

#### Log Management

```typescript
// Get statistics
const stats = logger.getStats();
console.log(stats);
// { total: 347, byLevel: { debug: 120, info: 200, warn: 20, error: 7 } }

// Export logs
const json = await logger.exportLogs();
console.log(json); // Full JSON export

// Clear all logs
await logger.clearLogs();
```

### For Users (Viewing Logs)

#### Chrome DevTools

1. **Open DevTools** - Press F12 or right-click → Inspect
2. **Go to Console tab**
3. **Look for** `[Privaseer ...]` prefixed messages

**Console Format:**
```
[Privaseer INFO] [ServiceWorker] 2025-10-04T12:00:00.000Z Extension initialized
[Privaseer DEBUG] [TabManager] 2025-10-04T12:00:01.000Z Tab 123 loading
[Privaseer WARN] [MessageBus] 2025-10-04T12:00:02.000Z Message timeout
[Privaseer ERROR] [Storage] 2025-10-04T12:00:03.000Z Failed to save Error: Quota exceeded
```

#### Extension Background Page

1. Go to `chrome://extensions/`
2. Enable "Developer mode"
3. Find Privaseer
4. Click "Service Worker" link
5. View all background logs in console

#### Using Browser Console

```javascript
// Access logger from popup or background page
await chrome.runtime.sendMessage({
  type: 'GET_LOGS'
});
```

## Log Categories

### ServiceWorker
Main background script events:
- Extension initialization
- Message handling
- Tab events
- Protection toggles

### FirewallEngine
Tracker blocking events:
- Rules enabled/disabled
- Trackers blocked
- Badge updates

### Storage
Data persistence events:
- Data saved
- Data loaded
- Storage errors

### TabManager
Tab lifecycle events:
- Tabs created/updated/removed
- Tab activated
- Block counts

### MessageBus
Inter-component communication:
- Messages sent/received
- Message timeouts
- Handler registration

### Logger
Logging system itself:
- Logger initialized
- Logs saved
- Logs cleared

## Performance Impact

### Memory Usage
- **Per log entry**: ~100-200 bytes
- **500 logs**: ~50-100 KB
- **Total overhead**: < 0.1% of extension memory

### CPU Usage
- **Logging operation**: < 0.001ms
- **Auto-save flush**: < 5ms every 5 seconds
- **Impact**: Negligible

### Storage
- **Logs stored**: chrome.storage.local
- **Space used**: ~100 KB max
- **Quota available**: 10 MB (1% usage)

## Configuration

### Development vs Production

**Development Mode** (NODE_ENV=development):
- All log levels shown in console
- More verbose logging
- Detailed stack traces

**Production Mode** (default):
- INFO, WARN, ERROR shown in console
- DEBUG logs hidden from console (but still saved)
- Optimized performance

### Constants

Located in `src/utils/logger.ts`:

```typescript
const MAX_LOGS = 500;                        // Max log entries
const MAX_LOG_AGE_MS = 7 * 24 * 60 * 60 * 1000;  // 7 days
const STORAGE_KEY = 'privaseer_logs';        // Storage key
```

## Troubleshooting

### Logs Not Appearing

**Problem**: Console shows no logs

**Solutions**:
1. Check console filters - ensure "Info" level is enabled
2. Verify extension is loaded correctly
3. Check if logger is initialized (first log should say "Logger initialized")

### Storage Full Error

**Problem**: "Quota exceeded" error when saving logs

**Solutions**:
1. Logs will auto-cleanup old entries
2. Manually clear logs: `await logger.clearLogs()`
3. Check total chrome.storage.local usage

### Missing Historical Logs

**Problem**: Old logs disappeared

**Solutions**:
- Expected behavior - logs older than 7 days are auto-deleted
- Export logs regularly if you need long-term history
- Increase `MAX_LOG_AGE_MS` if needed (not recommended)

## Best Practices

### When to Log

✅ **DO log:**
- Initialization and shutdown
- Important state changes
- Errors and warnings
- User actions (locally only)
- System events

❌ **DON'T log:**
- Sensitive data (passwords, tokens)
- Personal information (URLs with tokens)
- High-frequency events (every mouse move)
- Redundant information

### Choosing Log Levels

Use this decision tree:

```
Is it an error that breaks functionality?
├─ YES → ERROR
└─ NO → Is it something unusual?
    ├─ YES → WARN
    └─ NO → Is it important to know?
        ├─ YES → INFO
        └─ NO → DEBUG
```

### Message Format

Good log messages are:
- **Clear**: "Extension initialized" ✅ not "Init done" ❌
- **Concise**: Short, to the point
- **Actionable**: Include relevant context
- **Consistent**: Use same wording for similar events

### Using Data Parameter

```typescript
// Good - structured data
logger.info('Storage', 'Data saved', {
  size: data.length,
  duration: Date.now() - start
});

// Bad - concatenated string
logger.info('Storage', `Data saved: ${data.length} bytes`);
```

## Advanced Usage

### Custom Log Viewer (Future Feature)

In a future version, you'll be able to view logs in the popup:

```
┌────────────────────────────────────┐
│  Logs (347 entries)                │
├────────────────────────────────────┤
│  [ERROR] Storage | 2m ago          │
│  Failed to save data               │
│                                    │
│  [WARN] MessageBus | 5m ago        │
│  Message timeout: GET_STATE        │
│                                    │
│  [INFO] ServiceWorker | 10m ago    │
│  Protection enabled                │
└────────────────────────────────────┘
```

### Log Export Format

```json
{
  "exportDate": "2025-10-04T12:00:00.000Z",
  "version": "2.0.0",
  "logs": [
    {
      "timestamp": 1696435200000,
      "level": "info",
      "category": "ServiceWorker",
      "message": "Extension initialized",
      "data": { "tabs": 5 }
    }
  ]
}
```

## Privacy & Security

### What We Log
✅ Component names
✅ Event types
✅ Timestamps
✅ Error messages
✅ Tab IDs (numbers only)
✅ Domain names (for blocked trackers)

### What We DON'T Log
❌ Full URLs with query parameters
❌ User credentials
❌ Personal information
❌ Browsing history
❌ Form data

### Where Logs Go
- ✅ **Local storage only** - Never sent anywhere
- ✅ **No telemetry** - We don't collect logs
- ✅ **No analytics** - No external services
- ✅ **User controlled** - You can clear anytime

## Summary

The logging system provides:
- 📊 **4 log levels** - debug, info, warn, error
- 💾 **Persistent storage** - Survives restarts
- 🔍 **Easy querying** - Filter by level/category
- 📈 **Statistics** - Track log patterns
- 🗑️ **Auto-cleanup** - Manages size automatically
- 🔒 **Privacy-first** - All data stays local

Perfect for debugging issues and understanding extension behavior!

---

**Version:** 2.1.0
**Last Updated:** 2025-10-04

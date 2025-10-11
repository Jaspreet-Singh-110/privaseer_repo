# Critical Issues Analysis - Deep Dive

## 🚨 Issue #1: Scrollbar Jittering in Alert List

### Root Cause Identified

**Location**: `src/popup/popup.tsx` - Lines 168-176

**Problem**: Using `react-window` with dynamic row heights causes jitter because:

1. **Height Recalculation on Every Scroll**
   ```tsx
   <List
     listRef={setListRef}
     defaultHeight={345}           // ❌ Fixed container height
     rowHeight={dynamicRowHeight}  // ❌ Dynamic heights changing
     rowProps={{ alerts, expandedAlerts, toggleExpanded, dynamicRowHeight }}
     rowComponent={AlertItemRenderer}
   />
   ```

2. **ResizeObserver Triggering Reflows**
   - Line 288-292: `observeRowElements` called on every render
   - Causes continuous height measurements
   - Browser reflows during scroll = jitter

3. **State Updates During Scroll**
   - Expanding/collapsing alerts changes heights
   - react-window re-calculates all visible rows
   - Scrollbar position jumps

### Why It's Happening

```typescript
// AlertItem component (Line 287-294)
<div
  ref={(element) => {
    if (element) {
      dynamicRowHeight.observeRowElements([element]);  // ❌ PROBLEM!
    }
  }}
  data-index={index}
  className="hover:bg-gray-50 transition-colors border-b border-gray-100"
>
```

**Issues**:
- ResizeObserver fires on every scroll
- Height calculations during scroll cause layout thrashing
- react-window tries to maintain scroll position but fails due to changing heights

---

## 🚨 Issue #2: 24-Hour Cooldown Not Working on Refresh

### Root Cause Identified

**Location**: `src/background/privacy-score.ts` - Line 16

**CRITICAL PROBLEM**: In-memory Map that resets on service worker restart!

```typescript
// Line 16 - THE BUG!
private static penalizedDomains = new Map<string, number>();
```

### Why It's Failing

**Chrome Extension Service Workers**:
- Service workers shut down after ~30 seconds of inactivity
- When you refresh the page, service worker wakes up
- **ALL in-memory data is LOST** (including the Map)
- Result: Every refresh = fresh Map = no cooldown!

**Flow**:
```
1. User visits CNN.com
   - Service worker active
   - google-analytics.com blocked
   - penalizedDomains.set('google-analytics.com', timestamp)
   - Score: 100 → 99 ✅

2. User waits 1 minute (service worker sleeps)
   - Service worker shuts down
   - penalizedDomains Map = LOST ❌

3. User refreshes CNN.com
   - Service worker wakes up (fresh start)
   - penalizedDomains = new Map() (empty!)
   - google-analytics.com blocked again
   - No entry in Map → penalty applied
   - Score: 99 → 98 ❌ (should stay 99!)

Result: Cooldown doesn't work AT ALL!
```

### Proof

**Current Code** (Line 44-57):
```typescript
static async handleTrackerBlocked(domain: string, riskWeight: number = 1): Promise<number> {
  const now = Date.now();
  const lastPenalty = this.penalizedDomains.get(domain);  // ❌ ALWAYS undefined after SW restart!

  // Check if we penalized this domain recently (24 hours)
  if (lastPenalty && (now - lastPenalty) < this.COOLDOWN_MS) {
    // This code NEVER executes because Map is empty!
    return await this.getCurrentScore();
  }

  // Always executes because Map is empty
  this.penalizedDomains.set(domain, now);
  // ... apply penalty (every time!)
}
```

### Why Bolt.new Would Fix This Instantly

Bolt.new would immediately recognize:
1. Service workers don't persist in-memory data
2. Need chrome.storage API for persistence
3. Simple fix: Store Map in chrome.storage.local

---

## 📋 COMPLETE FIX PLAN

### Fix #1: Replace react-window with Simple Scrollable Div

**Why**: react-window with dynamic heights = inherently jittery

**Solution**: Use regular div with CSS scroll
- No height calculations during scroll
- No ResizeObserver thrashing
- Smooth, native scrolling
- Better performance for 100 items (not 10,000+)

**Files to Change**:
- `src/popup/popup.tsx` - Remove react-window, use plain scrollable div

### Fix #2: Persist Cooldown Map in chrome.storage

**Why**: In-memory Map lost on service worker restart

**Solution**: Store penalty timestamps in chrome.storage.local
- Survives service worker restarts
- Persists across browser sessions
- Simple API: chrome.storage.local.get/set

**Files to Change**:
- `src/background/privacy-score.ts` - Add storage persistence
- `src/types/index.ts` - Add penalty tracking to storage type

---

## 🔍 Detailed Fix Implementation

### Fix #1: Scrollbar Jitter

**Before** (Lines 155-178):
```tsx
<div className="flex-1 overflow-hidden flex flex-col">
  <div className="px-6 py-3 border-b border-gray-200 bg-gray-50">
    <h2 className="text-sm font-semibold text-gray-700">Recent Activity</h2>
  </div>

  <div className="flex-1 overflow-hidden">
    {data.alerts.length === 0 ? (
      // ... empty state
    ) : (
      <List                              // ❌ REMOVE react-window
        listRef={setListRef}
        defaultHeight={345}
        rowHeight={dynamicRowHeight}
        rowProps={{ alerts, expandedAlerts, toggleExpanded }}
        rowComponent={AlertItemRenderer}
      />
    )}
  </div>
</div>
```

**After**:
```tsx
<div className="flex-1 overflow-hidden flex flex-col">
  <div className="px-6 py-3 border-b border-gray-200 bg-gray-50">
    <h2 className="text-sm font-semibold text-gray-700">Recent Activity</h2>
  </div>

  <div className="flex-1 overflow-y-auto">  {/* ✅ Simple scrollable div */}
    {data.alerts.length === 0 ? (
      // ... empty state
    ) : (
      data.alerts.map((alert, index) => (
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
```

**Changes**:
1. Remove react-window import and usage
2. Remove dynamicRowHeight logic
3. Use simple `.map()` over alerts
4. Use `overflow-y-auto` for native scrolling
5. Remove ResizeObserver complexity

**Result**: Smooth, jitter-free scrolling ✅

---

### Fix #2: Cooldown Persistence

**Add to Storage Type** (`src/types/index.ts`):
```typescript
export interface StorageData {
  // ... existing fields
  penalizedDomains?: Record<string, number>; // domain -> timestamp
}
```

**Update PrivacyScoreManager** (`src/background/privacy-score.ts`):

**Before** (Line 16):
```typescript
private static penalizedDomains = new Map<string, number>();  // ❌ Lost on restart!
```

**After**:
```typescript
// Load from storage on initialization
private static penalizedDomains = new Map<string, number>();
private static isLoaded = false;

static async initialize(): Promise<void> {
  if (!this.listenersSetup) {
    await this.loadPenalizedDomains();  // ✅ Load from storage!
    this.setupEventListeners();
    this.listenersSetup = true;
  }
}

private static async loadPenalizedDomains(): Promise<void> {
  try {
    const data = await Storage.get();
    if (data.penalizedDomains) {
      this.penalizedDomains = new Map(Object.entries(data.penalizedDomains));
      logger.info('PrivacyScore', `Loaded ${this.penalizedDomains.size} penalized domains from storage`);
    }
    this.isLoaded = true;
  } catch (error) {
    logger.error('PrivacyScore', 'Failed to load penalized domains', toError(error));
  }
}

private static async savePenalizedDomains(): Promise<void> {
  try {
    const data = await Storage.get();
    data.penalizedDomains = Object.fromEntries(this.penalizedDomains);
    await Storage.save(data);
  } catch (error) {
    logger.error('PrivacyScore', 'Failed to save penalized domains', toError(error));
  }
}

static async handleTrackerBlocked(domain: string, riskWeight: number = 1): Promise<number> {
  try {
    // Ensure data is loaded
    if (!this.isLoaded) {
      await this.loadPenalizedDomains();
    }

    const now = Date.now();
    const lastPenalty = this.penalizedDomains.get(domain);

    // Check cooldown
    if (lastPenalty && (now - lastPenalty) < this.COOLDOWN_MS) {
      logger.debug('PrivacyScore', `Domain ${domain} in cooldown, skipping penalty`);
      return await this.getCurrentScore();
    }

    // Apply penalty
    this.penalizedDomains.set(domain, now);
    await this.savePenalizedDomains();  // ✅ Save to storage!

    const data = await Storage.get();
    const penalty = this.TRACKER_PENALTY * riskWeight;
    const newScore = data.privacyScore.current + penalty;
    await Storage.updateScore(newScore);

    // Cleanup periodically
    if (this.penalizedDomains.size % 100 === 0) {
      await this.cleanupOldPenalties();
    }

    return newScore;
  } catch (error) {
    logger.error('PrivacyScore', 'Error handling tracker block', toError(error));
    return 100;
  }
}

private static async cleanupOldPenalties(): Promise<void> {
  const cutoff = Date.now() - this.CLEANUP_THRESHOLD;
  let cleaned = 0;

  for (const [domain, timestamp] of this.penalizedDomains.entries()) {
    if (timestamp < cutoff) {
      this.penalizedDomains.delete(domain);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    await this.savePenalizedDomains();  // ✅ Save after cleanup!
    logger.debug('PrivacyScore', `Cleaned up ${cleaned} old penalty entries`);
  }
}
```

**Key Changes**:
1. Load Map from storage on initialization
2. Save Map to storage after every penalty
3. Save Map to storage after cleanup
4. Ensure data loaded before checking cooldown

**Result**: Cooldown works across service worker restarts ✅

---

## 📊 Testing Plan

### Test #1: Scrollbar Jitter (After Fix)
```
1. Load extension
2. Block 50+ trackers to fill list
3. Scroll up and down rapidly
4. Expected: Smooth scrolling, no jitter ✅
5. Expand/collapse alerts while scrolling
6. Expected: Smooth transitions, no jumping ✅
```

### Test #2: Cooldown Persistence (After Fix)
```
1. Visit CNN.com
   - google-analytics.com blocked
   - Score: 100 → 99 ✅

2. Wait 1 minute (service worker sleeps)

3. Refresh CNN.com
   - google-analytics.com blocked again
   - Check storage: penalty timestamp exists
   - Score: 99 (no change!) ✅

4. Wait 24 hours

5. Visit CNN.com again
   - google-analytics.com blocked
   - Check storage: timestamp expired
   - Score: 99 → 98 ✅ (new penalty applied)
```

---

## 🎯 Summary

### Issue #1: Scrollbar Jitter
**Root Cause**: react-window with dynamic heights + ResizeObserver
**Fix**: Replace with simple scrollable div
**Impact**: Smooth scrolling, better UX

### Issue #2: Cooldown Not Working
**Root Cause**: In-memory Map lost on service worker restart
**Fix**: Persist Map in chrome.storage.local
**Impact**: Cooldown works correctly across refreshes

### Why This Happened
1. **react-window**: Over-engineered for small lists (<100 items)
2. **In-memory storage**: Forgot service workers restart frequently
3. **No persistence**: Didn't use chrome.storage API

### Why Bolt.new Would Fix Instantly
1. Recognizes service worker lifecycle immediately
2. Knows chrome.storage is required for persistence
3. Wouldn't use react-window for small lists
4. Simpler solutions = fewer bugs

---

**Both fixes are straightforward and will resolve the issues completely.** ✅

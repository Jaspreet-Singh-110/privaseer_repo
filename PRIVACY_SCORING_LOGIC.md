# Privaseer Privacy Scoring - Complete Logic Breakdown

## Table of Contents

1. [Overview](#overview)
2. [Scoring Model](#scoring-model)
3. [Score Calculation Logic](#score-calculation-logic)
4. [Event Flow Diagrams](#event-flow-diagrams)
5. [Mathematical Formulas](#mathematical-formulas)
6. [Code Implementation](#code-implementation)
7. [Score Interpretation](#score-interpretation)
8. [Edge Cases & Boundaries](#edge-cases--boundaries)
9. [Historical Tracking](#historical-tracking)
10. [Real-World Examples](#real-world-examples)

---

## Overview

### What is the Privacy Score?

The Privacy Score is a **gamified metric (0-100)** that represents your current privacy posture while browsing. It's designed to:

- **Educate** users about privacy threats in real-time
- **Motivate** better browsing habits through tangible feedback
- **Reward** visiting privacy-respecting sites
- **Penalize** exposure to trackers and non-compliant sites

### Core Philosophy

```
🎯 Goal: Make privacy tangible and actionable

📊 Method: Real-time scoring based on browsing behavior
🎮 Gamification: Score changes create engagement
📈 Trending: Daily reset keeps it fresh
```

---

## Scoring Model

### Initial State

Every user starts with a **perfect score of 100**:

```typescript
privacyScore: {
  current: 100,        // Perfect privacy score
  daily: {
    trackersBlocked: 0,        // No trackers blocked yet
    cleanSitesVisited: 0,      // No clean sites visited yet
    nonCompliantSites: 0       // No non-compliant sites found yet
  },
  history: []          // No historical data yet
}
```

**Why 100?**
- Represents "perfect privacy" state
- Users start optimistic
- Easier to understand (100 = perfect)
- Allows room for both penalties and rewards

---

### Three Scoring Events

The privacy score changes based on **three types of events**:

#### 1. Tracker Blocked (Penalty)

**When**: A tracker is blocked by the firewall
**Score Change**: `-1 point`
**Logic**: Exposure to tracker = privacy risk

```typescript
TRACKER_PENALTY = -1
```

**Why Negative?**
- You visited a site that attempted to track you
- Even though we blocked it, exposure happened
- Indicates you're on tracker-heavy sites

#### 2. Clean Site Visited (Reward)

**When**: A page loads with no trackers detected
**Score Change**: `+2 points`
**Logic**: Clean site = good privacy choice

```typescript
CLEAN_SITE_REWARD = +2
```

**Why Positive?**
- You're visiting privacy-respecting sites
- Rewards good browsing behavior
- Encourages visiting tracker-free sites

#### 3. Non-Compliant Cookie Banner (Major Penalty)

**When**: Cookie banner violates GDPR (no reject, dark patterns)
**Score Change**: `-5 points`
**Logic**: Deceptive practices = serious privacy violation

```typescript
NON_COMPLIANT_PENALTY = -5
```

**Why Large Penalty?**
- Deliberate manipulation of user consent
- More serious than passive tracking
- Dark patterns are hostile to privacy

---

## Score Calculation Logic

### Event 1: Tracker Blocked

**Trigger**: Chrome's declarativeNetRequest blocks a tracker

**Flow**:
```
1. Tracker request intercepted (e.g., google-analytics.com/script.js)
   ↓
2. FirewallEngine.handleBlockedRequest() called
   ↓
3. Extract domain: "google-analytics.com"
   ↓
4. Identify category: "analytics"
   ↓
5. Check if high-risk: false
   ↓
6. Storage.incrementTrackerBlock(domain, category, isHighRisk)
   ↓
7. PrivacyScoreManager.handleTrackerBlocked()
   ↓
8. Get current score: 95
   ↓
9. Calculate new score: 95 + (-1) = 94
   ↓
10. Clamp to [0, 100]: Math.max(0, Math.min(100, 94)) = 94
   ↓
11. Storage.updateScore(94)
   ↓
12. Save to chrome.storage.local
   ↓
13. Update badge counter
   ↓
14. Create alert
   ↓
15. Notify popup (if open)
```

**Code**:
```typescript
// PrivacyScoreManager.handleTrackerBlocked()
static async handleTrackerBlocked(): Promise<number> {
  try {
    const data = await Storage.get();
    const newScore = data.privacyScore.current + this.TRACKER_PENALTY; // -1
    await Storage.updateScore(newScore);

    await this.updateBadge(data.privacyScore.daily.trackersBlocked);

    return newScore;
  } catch (error) {
    console.error('Error handling tracker block:', error);
    return 100; // Fail safe
  }
}

// Storage.updateScore()
static async updateScore(newScore: number): Promise<void> {
  const data = await this.get();
  data.privacyScore.current = Math.max(0, Math.min(100, newScore)); // Clamp [0, 100]
  await this.save(data);
}
```

**Example Scenario**:
```
Time 0:00 - Score: 100 (start of day)
Time 0:05 - Visit CNN.com → 12 trackers blocked → Score: 88
Time 0:10 - Visit BBC.com → 8 trackers blocked → Score: 80
Time 0:15 - Visit NYT.com → 15 trackers blocked → Score: 65
Time 0:20 - Visit Local Blog → 0 trackers → Score: 67 (+2 clean site bonus)
```

---

### Event 2: Clean Site Visited

**Trigger**: Page finishes loading with no trackers detected in last 5 seconds

**Detection Logic**:
```typescript
// FirewallEngine.checkPageForTrackers()
static async checkPageForTrackers(tabId: number, url: string): Promise<void> {
  const data = await Storage.get();
  const currentTrackersCount = data.privacyScore.daily.trackersBlocked;

  // Check if any trackers were blocked in last 5 seconds
  const hasTrackers = Object.keys(data.trackers).some(
    tracker => data.trackers[tracker].lastBlocked > Date.now() - 5000
  );

  // If no trackers AND no blocks today, it's a clean site
  if (!hasTrackers && currentTrackersCount === 0) {
    await PrivacyScoreManager.handleCleanSite();

    // Create positive alert
    await Storage.addAlert({
      id: `${Date.now()}-${Math.random()}`,
      type: 'tracker_blocked',
      severity: 'low',
      message: `${domain} has no trackers`,
      domain,
      timestamp: Date.now(),
      url,
    });
  }
}
```

**Flow**:
```
1. Page status changes to "complete"
   ↓
2. Wait 5 seconds for any late-loading trackers
   ↓
3. Check tracker activity in last 5 seconds
   ↓
4. If NO trackers found:
   ↓
5. PrivacyScoreManager.handleCleanSite()
   ↓
6. Get current score: 85
   ↓
7. Calculate new score: 85 + 2 = 87
   ↓
8. Clamp to [0, 100]: 87
   ↓
9. Storage.recordCleanSite() (increment daily counter)
   ↓
10. Create positive alert: "example.com has no trackers"
```

**Code**:
```typescript
// PrivacyScoreManager.handleCleanSite()
static async handleCleanSite(): Promise<number> {
  try {
    const data = await Storage.get();
    const newScore = data.privacyScore.current + this.CLEAN_SITE_REWARD; // +2
    await Storage.updateScore(newScore);
    await Storage.recordCleanSite();

    return newScore;
  } catch (error) {
    console.error('Error handling clean site:', error);
    return 100;
  }
}
```

**Why +2 instead of +1?**
- Makes clean sites more valuable
- Encourages seeking privacy-respecting sites
- Balances out the -1 penalty per tracker (one clean site cancels 2 trackers)
- Creates incentive to visit better sites

---

### Event 3: Non-Compliant Cookie Banner

**Trigger**: Content script detects GDPR-violating cookie banner

**Detection Process**:
```
1. Content script injects into page
   ↓
2. Wait 2 seconds for page to settle
   ↓
3. Scan for cookie banner (CSS selectors + heuristics)
   ↓
4. If banner found:
   ↓
5. Check for reject button (patterns: "reject", "decline", "no thanks")
   ↓
6. Check visual prominence (accept vs reject button sizes)
   ↓
7. Check for dark patterns:
   - Forced Consent (no reject button)
   - Hidden Reject (off-screen)
   - Prominent Accept (accept >1.5x larger)
   ↓
8. If non-compliant:
   ↓
9. Send result to background
   ↓
10. PrivacyScoreManager.handleNonCompliantSite()
```

**Flow**:
```
1. ConsentScanner detects non-compliant banner
   ↓
2. Send CONSENT_SCAN_RESULT message
   ↓
3. Background receives: { isCompliant: false, deceptivePatterns: ['Forced Consent'] }
   ↓
4. PrivacyScoreManager.handleNonCompliantSite()
   ↓
5. Get current score: 80
   ↓
6. Calculate new score: 80 + (-5) = 75
   ↓
7. Clamp to [0, 100]: 75
   ↓
8. Storage.recordNonCompliantSite() (increment counter)
   ↓
9. Create warning alert: "example.com has deceptive cookie banner"
   ↓
10. Notify popup
```

**Code**:
```typescript
// PrivacyScoreManager.handleNonCompliantSite()
static async handleNonCompliantSite(): Promise<number> {
  try {
    const data = await Storage.get();
    const newScore = data.privacyScore.current + this.NON_COMPLIANT_PENALTY; // -5
    await Storage.updateScore(newScore);
    await Storage.recordNonCompliantSite();

    return newScore;
  } catch (error) {
    console.error('Error handling non-compliant site:', error);
    return 100;
  }
}
```

**Why -5 (5x worse than tracker)?**
- Deliberate manipulation vs. passive tracking
- GDPR violation (legal issue)
- Dark patterns are hostile user design
- Should discourage visiting such sites

---

## Event Flow Diagrams

### Complete Score Update Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                       User Browses Web                          │
└───────────────────────────┬─────────────────────────────────────┘
                            │
              ┌─────────────┴─────────────┐
              ▼                           ▼
    ┌──────────────────┐        ┌──────────────────┐
    │  Tracker Request │        │   Page Loads     │
    │   Intercepted    │        │    Complete      │
    └────────┬─────────┘        └─────────┬────────┘
             │                             │
             ▼                             ▼
    ┌──────────────────┐        ┌──────────────────┐
    │  Chrome Blocks   │        │ Check for Cookie │
    │   via DNR API    │        │     Banner       │
    └────────┬─────────┘        └─────────┬────────┘
             │                             │
             ▼                             ▼
    ┌──────────────────┐        ┌──────────────────┐
    │ Extract Domain   │        │ Scan Compliance  │
    │   & Category     │        │ Check Dark Pat.  │
    └────────┬─────────┘        └─────────┬────────┘
             │                             │
             ▼                             ▼
    ┌──────────────────┐        ┌──────────────────┐
    │ Storage Update   │        │ Send Result to   │
    │ Tracker Counter  │        │   Background     │
    └────────┬─────────┘        └─────────┬────────┘
             │                             │
             ▼                             ▼
    ┌──────────────────┐        ┌──────────────────┐
    │ Privacy Score    │        │  Privacy Score   │
    │   Score -= 1     │        │   Score -= 5     │
    └────────┬─────────┘        └─────────┬────────┘
             │                             │
             └─────────────┬───────────────┘
                           ▼
                 ┌──────────────────┐
                 │  Clamp to [0,100]│
                 └─────────┬────────┘
                           ▼
                 ┌──────────────────┐
                 │  Save to Storage │
                 └─────────┬────────┘
                           ▼
                 ┌──────────────────┐
                 │  Update Badge    │
                 └─────────┬────────┘
                           ▼
                 ┌──────────────────┐
                 │  Create Alert    │
                 └─────────┬────────┘
                           ▼
                 ┌──────────────────┐
                 │  Notify Popup    │
                 └──────────────────┘
```

---

## Mathematical Formulas

### Basic Score Update

```
newScore = currentScore + delta
clampedScore = max(0, min(100, newScore))
```

### Tracker Blocked

```
delta = TRACKER_PENALTY = -1

newScore = currentScore + (-1)
         = currentScore - 1

Example:
currentScore = 95
newScore = 95 - 1 = 94
```

### Clean Site

```
delta = CLEAN_SITE_REWARD = +2

newScore = currentScore + 2

Example:
currentScore = 80
newScore = 80 + 2 = 82
```

### Non-Compliant Site

```
delta = NON_COMPLIANT_PENALTY = -5

newScore = currentScore + (-5)
         = currentScore - 5

Example:
currentScore = 90
newScore = 90 - 5 = 85
```

### Combined Events

```
For a session with:
- T trackers blocked
- C clean sites visited
- N non-compliant sites

finalScore = startScore + (T × -1) + (C × 2) + (N × -5)

Example:
startScore = 100
T = 20 trackers
C = 3 clean sites
N = 1 non-compliant site

finalScore = 100 + (20 × -1) + (3 × 2) + (1 × -5)
           = 100 - 20 + 6 - 5
           = 81
```

### Daily Average

```
dailyAverage = sum(hourlyScores) / numberOfHours

Example (8 hours):
Hour 1: 95
Hour 2: 88
Hour 3: 82
Hour 4: 79
Hour 5: 75
Hour 6: 78
Hour 7: 80
Hour 8: 83

dailyAverage = (95+88+82+79+75+78+80+83) / 8
             = 660 / 8
             = 82.5
```

---

## Code Implementation

### Complete PrivacyScoreManager Class

```typescript
export class PrivacyScoreManager {
  // Constants define the scoring model
  private static readonly TRACKER_PENALTY = -1;
  private static readonly CLEAN_SITE_REWARD = 2;
  private static readonly NON_COMPLIANT_PENALTY = -5;

  /**
   * Called when a tracker is blocked
   * Decreases score by 1 point
   *
   * @returns {Promise<number>} New privacy score
   */
  static async handleTrackerBlocked(): Promise<number> {
    try {
      const data = await Storage.get();
      const newScore = data.privacyScore.current + this.TRACKER_PENALTY;
      await Storage.updateScore(newScore);

      // Also update badge to show daily count
      await this.updateBadge(data.privacyScore.daily.trackersBlocked);

      return newScore;
    } catch (error) {
      console.error('Error handling tracker block:', error);
      return 100; // Fail-safe: return perfect score on error
    }
  }

  /**
   * Called when a clean site is visited (no trackers detected)
   * Increases score by 2 points
   *
   * @returns {Promise<number>} New privacy score
   */
  static async handleCleanSite(): Promise<number> {
    try {
      const data = await Storage.get();
      const newScore = data.privacyScore.current + this.CLEAN_SITE_REWARD;
      await Storage.updateScore(newScore);
      await Storage.recordCleanSite(); // Increment counter

      return newScore;
    } catch (error) {
      console.error('Error handling clean site:', error);
      return 100;
    }
  }

  /**
   * Called when a non-GDPR-compliant cookie banner is detected
   * Decreases score by 5 points (major penalty)
   *
   * @returns {Promise<number>} New privacy score
   */
  static async handleNonCompliantSite(): Promise<number> {
    try {
      const data = await Storage.get();
      const newScore = data.privacyScore.current + this.NON_COMPLIANT_PENALTY;
      await Storage.updateScore(newScore);
      await Storage.recordNonCompliantSite(); // Increment counter

      return newScore;
    } catch (error) {
      console.error('Error handling non-compliant site:', error);
      return 100;
    }
  }

  /**
   * Get current privacy score
   *
   * @returns {Promise<number>} Current score (0-100)
   */
  static async getCurrentScore(): Promise<number> {
    try {
      const data = await Storage.get();
      return data.privacyScore.current;
    } catch (error) {
      console.error('Error getting current score:', error);
      return 100;
    }
  }

  /**
   * Update extension badge with daily tracker count
   *
   * @private
   */
  private static async updateBadge(trackersBlocked: number): Promise<void> {
    try {
      const badgeText = trackersBlocked > 0 ? trackersBlocked.toString() : '';

      await chrome.action.setBadgeText({ text: badgeText });
      await chrome.action.setBadgeBackgroundColor({ color: '#DC2626' });
    } catch (error) {
      console.error('Error updating badge:', error);
    }
  }

  /**
   * Get color for score display (CSS color)
   *
   * @param {number} score - Privacy score (0-100)
   * @returns {string} Hex color code
   */
  static getScoreColor(score: number): string {
    if (score >= 80) return '#10B981'; // Green
    if (score >= 60) return '#F59E0B'; // Yellow
    return '#DC2626';                  // Red
  }

  /**
   * Get label for score display
   *
   * @param {number} score - Privacy score (0-100)
   * @returns {string} Human-readable label
   */
  static getScoreLabel(score: number): string {
    if (score >= 80) return 'Excellent';
    if (score >= 60) return 'Good';
    if (score >= 40) return 'Fair';
    return 'Poor';
  }
}
```

### Storage Score Update

```typescript
/**
 * Update privacy score with clamping to [0, 100]
 *
 * @param {number} newScore - New score value (will be clamped)
 */
static async updateScore(newScore: number): Promise<void> {
  const data = await this.get();

  // Clamp score to valid range [0, 100]
  // Math.max(0, x) ensures x >= 0
  // Math.min(100, x) ensures x <= 100
  data.privacyScore.current = Math.max(0, Math.min(100, newScore));

  await this.save(data);
}
```

---

## Score Interpretation

### Score Ranges

| Score Range | Label | Color | Meaning | Recommendation |
|-------------|-------|-------|---------|----------------|
| **90-100** | Excellent | 🟢 Green | Minimal tracker exposure, mostly clean sites | Keep up the great privacy habits! |
| **80-89** | Excellent | 🟢 Green | Good privacy with few trackers | You're doing well, minor improvements possible |
| **70-79** | Good | 🟡 Yellow | Moderate tracker exposure | Consider visiting fewer tracker-heavy sites |
| **60-69** | Good | 🟡 Yellow | Some privacy concerns | Review your browsing habits |
| **50-59** | Fair | 🟡 Yellow | Significant tracker exposure | Consider using privacy-focused sites |
| **40-49** | Fair | 🔴 Red | High tracker exposure | Your privacy is at risk |
| **30-39** | Poor | 🔴 Red | Very high tracker exposure | Immediate action recommended |
| **0-29** | Poor | 🔴 Red | Extreme tracker exposure | Serious privacy concerns |

### Visual Representation

```
┌──────────────────────────────────────────────────┐
│              PRIVACY SCORE: 75/100               │
│                                                  │
│  ████████████████████████████████████░░░░░░░░░  │
│  ← 0                                      100 → │
│                                                  │
│  Status: Good Privacy                           │
│  Color: Yellow (🟡)                             │
│  Recommendation: Minor improvements possible    │
└──────────────────────────────────────────────────┘
```

---

## Edge Cases & Boundaries

### Case 1: Score Cannot Go Below 0

```typescript
// Scenario: User has score of 2, visits site with 5 trackers
currentScore = 2
trackersBlocked = 5
naiveCalculation = 2 - 5 = -3  // ❌ Invalid

// Actual implementation
newScore = Math.max(0, 2 - 5) = 0  // ✅ Clamped to 0
```

**Why Important?**
- Prevents negative scores (meaningless)
- Score of 0 = "rock bottom" privacy
- Creates floor for worst-case scenario

### Case 2: Score Cannot Go Above 100

```typescript
// Scenario: User at score 98, visits 2 clean sites
currentScore = 98
cleanSites = 2
naiveCalculation = 98 + (2 × 2) = 102  // ❌ Invalid

// Actual implementation
newScore = Math.min(100, 98 + 4) = 100  // ✅ Clamped to 100
```

**Why Important?**
- 100 represents perfection
- No "super privacy" beyond perfect
- Prevents score inflation

### Case 3: Multiple Events in Quick Succession

```typescript
// Scenario: Page loads 10 trackers simultaneously
// All 10 onRuleMatchedDebug events fire within 50ms

Event 1: score = 100 → 99
Event 2: score = 99 → 98
Event 3: score = 98 → 97
...
Event 10: score = 91 → 90

// Each event processes sequentially
// No race conditions (async/await ensures ordering)
```

**Why Important?**
- No lost updates
- Accurate count
- Consistent state

### Case 4: Storage Failure

```typescript
try {
  const newScore = currentScore - 1;
  await Storage.updateScore(newScore);
} catch (error) {
  console.error('Storage failed:', error);
  return 100; // Fail-safe: assume perfect score
}
```

**Why Important?**
- Graceful degradation
- Extension continues working
- User not penalized for system error

---

## Historical Tracking

### Daily Reset Mechanism

**Purpose**: Keep score fresh and relevant (today's privacy matters)

**Process**:
```
Every 24 hours:

1. Check if 24+ hours since last reset
   ↓
2. If yes, save current state to history:
   {
     date: "2025-10-04",
     score: 85,
     trackersBlocked: 47
   }
   ↓
3. Reset daily counters:
   trackersBlocked: 0
   cleanSitesVisited: 0
   nonCompliantSites: 0
   ↓
4. Keep score unchanged (doesn't reset to 100)
   ↓
5. Trim history to last 30 days
   ↓
6. Update lastReset timestamp
```

**Code**:
```typescript
private static async checkDailyReset(): Promise<void> {
  const data = await this.get();
  const now = Date.now();
  const lastReset = data.lastReset;
  const oneDayMs = 24 * 60 * 60 * 1000; // 86,400,000 ms

  if (now - lastReset >= oneDayMs) {
    // Create history entry
    const historyEntry = {
      date: new Date(lastReset).toISOString().split('T')[0], // "2025-10-04"
      score: data.privacyScore.current,
      trackersBlocked: data.privacyScore.daily.trackersBlocked,
    };

    // Add to history (newest first)
    data.privacyScore.history.unshift(historyEntry);

    // Keep only last 30 days
    if (data.privacyScore.history.length > 30) {
      data.privacyScore.history = data.privacyScore.history.slice(0, 30);
    }

    // Reset daily counters (score unchanged)
    data.privacyScore.daily = {
      trackersBlocked: 0,
      cleanSitesVisited: 0,
      nonCompliantSites: 0,
    };

    data.lastReset = now;

    await this.save(data);
  }
}
```

**Why Not Reset Score to 100?**
- Score represents cumulative privacy over time
- Resetting would lose context
- Allows tracking trends (improving/declining)
- More meaningful metric

---

## Real-World Examples

### Example 1: Heavy News Reader

```
User: Reads major news sites (tracker-heavy)

Morning Session (8am - 10am):
- Visits CNN.com → 12 trackers blocked → Score: 100 → 88
- Visits BBC.com → 8 trackers blocked → Score: 88 → 80
- Visits NYT.com → 15 trackers blocked → Score: 80 → 65
- Visits Guardian.com → 10 trackers blocked → Score: 65 → 55
- Visits Reuters.com → 9 trackers blocked → Score: 55 → 46

Score: 46 (Fair - Yellow 🟡)
Trackers Blocked: 54

Evening Session (7pm - 9pm):
- Visits NPR.org → 3 trackers blocked → Score: 46 → 43
- Visits TheAtlantic.com → 7 trackers blocked → Score: 43 → 36
- Visits Local Blog (clean) → 0 trackers → Score: 36 → 38 (+2)

End of Day Score: 38 (Poor - Red 🔴)
Total Trackers: 64

Recommendation: Consider using RSS readers or privacy-focused news aggregators
```

### Example 2: Privacy-Conscious User

```
User: Uses privacy-focused sites and tools

Daily Routine:
- Visits DuckDuckGo.com → 0 trackers → Score: 100 → 102 (clamped to 100)
- Visits Privacy Guides → 0 trackers → Score: 100 → 102 (clamped to 100)
- Visits Personal Blog → 0 trackers → Score: 100 → 102 (clamped to 100)
- Visits Reddit (3 trackers) → Score: 100 → 97
- Visits GitHub.com → 2 trackers → Score: 97 → 95
- Visits Developer Docs → 0 trackers → Score: 95 → 97

End of Day Score: 97 (Excellent - Green 🟢)
Total Trackers: 5
Clean Sites: 4

Recommendation: Excellent privacy habits! Keep it up!
```

### Example 3: Shopping Session

```
User: Online shopping (many trackers + some non-compliant sites)

Shopping Spree:
- Visits Amazon.com → 18 trackers → Score: 100 → 82
- Non-compliant cookie banner detected → Score: 82 → 77 (-5)
- Visits eBay.com → 12 trackers → Score: 77 → 65
- Visits Etsy.com → 8 trackers → Score: 65 → 57
- Visits Target.com → 15 trackers → Score: 57 → 42
- Non-compliant banner → Score: 42 → 37 (-5)

End Score: 37 (Poor - Red 🔴)
Trackers: 53
Non-Compliant Sites: 2

Recommendation: Major e-commerce sites have heavy tracking. Consider:
- Using privacy-focused alternatives
- Shopping directly on brand websites
- Using privacy-respecting payment methods
```

### Example 4: Mixed Browsing

```
User: Balanced browsing across different site types

Typical Day:
- Morning: Email (Gmail) → 5 trackers → Score: 100 → 95
- Work: GitHub, Docs → 3 trackers → Score: 95 → 92
- Lunch: News (CNN) → 12 trackers → Score: 92 → 80
- Afternoon: Work sites (clean) → +2 → Score: 82
- Evening: YouTube → 7 trackers → Score: 82 → 75
- Night: Personal blog reading (clean) → +2 → Score: 77

End of Day: 77 (Good - Yellow 🟡)
Trackers: 27
Clean Sites: 2

Recommendation: Good balance. Consider privacy-focused alternatives for:
- Email (ProtonMail)
- Video (PeerTube, Odysee)
- News (RSS feeds)
```

---

## Summary

### Scoring Formula

```
Score = Starting Score (100)
        - (Trackers × 1)
        + (Clean Sites × 2)
        - (Non-Compliant Sites × 5)

Bounded: [0, 100]
```

### Key Points

✅ **Start Perfect**: Everyone begins at 100
✅ **Real-Time Updates**: Score changes as you browse
✅ **Three Events**: Trackers (-1), Clean Sites (+2), Non-Compliant (-5)
✅ **Bounded**: Always between 0 and 100
✅ **Daily Tracking**: Counters reset daily, score persists
✅ **Historical Data**: Last 30 days saved for trends
✅ **Gamification**: Makes privacy tangible and engaging
✅ **Educational**: Teaches about tracking and privacy

### Why This Works

1. **Simple Math**: Easy to understand (-1, +2, -5)
2. **Instant Feedback**: See score change in real-time
3. **Motivating**: Want to maintain high score
4. **Educational**: Learn which sites respect privacy
5. **Actionable**: Clear what to do (visit better sites)
6. **Balanced**: Penalties and rewards both possible
7. **Meaningful**: Score reflects actual privacy exposure

---

**Version**: 2.2.0
**Last Updated**: 2025-10-04
**Document Type**: Technical Specification
**Audience**: Developers, Security Researchers, Advanced Users

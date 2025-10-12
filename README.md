# Privaseer

A privacy-first Chrome extension that blocks trackers, scores your privacy, and scans for deceptive cookie banners - all while keeping your data 100% local.

##  Features

###  Real-Time Tracker Blocking
- Blocks 120+ tracking domains across 7 categories
- 30 declarative blocking rules for maximum performance
- Per-tab badge showing blocked trackers on current page
- **NEW:** Actually pause/resume blocking (not just UI state)

###  Privacy Score (0-100)
- Starts at 100 (perfect privacy)
- Decreases by 1 for each tracker blocked (-1 point)
- Increases by 2 for visiting clean sites (+2 points)
- Decreases by 5 for deceptive cookie banners (-5 points)
- Real-time updates as you browse

###  Cookie Consent Scanner
- Automatically detects cookie banners on every page
- Checks for GDPR-compliant "Reject All" buttons
- Identifies dark patterns and deceptive design
- Alerts you to non-compliant sites

###  Beautiful Popup Interface
- Live activity feed with color-coded alerts
- **NEW:** Click info button to learn what trackers do
- **NEW:** See safer alternatives for each tracker
- Smooth animations and real-time updates
- Toggle protection with shield button

###  100% Private
- **Zero external API calls** - everything runs locally
- **No telemetry** - we don't collect any data
- **No accounts** - no login required
- **Open source** - fully auditable code

##  Quick Start

### Installation

1. **Build the extension:**
   ```bash
   npm install
   npm run build
   ```

2. **Load in Chrome:**
   - Open `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `dist` folder

3. **Start browsing!**
   - The shield icon appears in your toolbar
   - Click it to see your privacy score
   - Visit any website to see blocking in action

## 📸 What You'll See

### Popup Interface

```
┌────────────────────────────────────────┐
│  🛡️ Privaseer               [🛡️ Blue]│
├────────────────────────────────────────┤
│                                        │
│              94 / 100                  │  ← Privacy Score
│         Excellent Privacy              │
│                                        │
│         ❌ 12 blocked today            │  ← Daily Stats
│                                        │
├────────────────────────────────────────┤
│  Recent Activity                       │
├────────────────────────────────────────┤
│                                        │
│  🟢  🛡️  Blocked google-analytics    │
│          cnn.com      Just now    [i] │  ← Click for info
│                                        │
│  🔴  ⚠️  Blocked facebook.net (HIGH)  │
│          news.com          2m ago     │
│                                        │
│  🟡  ❌  bbc.co.uk has deceptive      │
│          cookie banner                 │
│          bbc.co.uk         5m ago     │
│                                        │
└────────────────────────────────────────┘
```

### Badge Counter

The extension icon shows a red badge with the number of trackers blocked **on the current tab**:

- Visit CNN.com → Badge shows "3"
- Switch to NYTimes.com → Badge shows "5"
- Switch back to CNN → Badge shows "3" again
- Navigate to new page → Badge resets to "0"

##  What's New

### v2.1 (Latest) - System Architecture Improvements

#### 📝 Comprehensive Logging System
- **4 log levels**: DEBUG, INFO, WARN, ERROR
- **Persistent storage**: Logs survive browser restarts
- **500 log entries**: Last 7 days of activity
- **Queryable**: Filter by level, category, or time
- **Export capability**: Download logs as JSON
- See [LOGGING_GUIDE.md](LOGGING_GUIDE.md) for details

#### 🔄 Advanced Message Bus
- **Reliable communication**: Between all components
- **Timeout handling**: 5-second timeout on requests
- **Request tracking**: Monitor pending operations
- **Broadcast support**: Notify all components instantly
- See [ARCHITECTURE.md](ARCHITECTURE.md) for details

#### 📊 Tab Lifecycle Manager
- **Complete tracking**: All tab events monitored
- **Active tab awareness**: Always knows current tab
- **Auto-cleanup**: Removes stale tab data
- **Statistics**: Track tabs and blocks across browser

#### 🎨 Custom Shield Icon
- **Professional design**: Blue shield with checkmark
- **Visible in toolbar**: No more default icon
- **All sizes**: 16px, 32px, 48px, 128px
- **SVG source**: Scalable vector graphics

### v2.0 - Core Feature Additions

#### 1. Real Pause/Resume Blocking ✅
Click the shield button to **actually** pause blocking. Previously only changed UI state, now it dynamically enables/disables blocking rules using Chrome's declarativeNetRequest API.

#### 2. Per-Tab Badge Counter ✅
Badge now shows count specific to each tab. Switch tabs to see different counts. No more confusing global counter.

#### 3. Expanded Tracker List ✅
- **15 → 30+ blocking rules**
- **50 → 120+ tracker domains**
- New categories: Heatmaps, Affiliate tracking
- Smart exceptions (e.g., don't block Facebook on Facebook.com)

#### 4. Tracker Information ✅
Click the info button (ℹ️) next to any blocked tracker to see:
- **What it does**: Simple explanation of the tracker
- **Alternative**: Privacy-friendly replacement suggestion

Example:
```
ℹ️ What it does:
Tracks user behavior and collects browsing
data for website analytics

💡 Alternative:
Use privacy-focused analytics like Plausible
or Simple Analytics
```

#### 5. Code Quality ✅
- Constants extracted to separate file
- Centralized logging system
- Proper error handling throughout
- Type-safe with strict TypeScript
- Industry-standard architecture

## 🔧 Technical Details

### Architecture

**Manifest V3** (latest standard)
- Service worker for background processing
- Content scripts for banner detection
- Declarative request blocking (high performance)
- React + TypeScript for popup UI

### Blocking Categories

1. **Analytics**: Google Analytics, Mixpanel, Amplitude, etc.
2. **Advertising**: DoubleClick, Facebook Ads, Criteo, etc.
3. **Social Media**: Facebook Pixel, Twitter tracking, LinkedIn tracking
4. **Fingerprinting**: FingerprintJS, device identification
5. **Beacons**: Tracking pixels, conversion tracking
6. **Heatmaps**: Hotjar, CrazyEgg, session recording
7. **Affiliate**: Commission tracking, referral links

### Safe Blocking

We **never block** essential services:
- Payment processors (Stripe, PayPal)
- Security services (reCAPTCHA)
- CDNs (Cloudflare, jsDelivr, unpkg)
- Essential libraries (jQuery, Google Fonts)

We **exclude from blocking** on their own domains:
- Google Analytics on Google.com
- Facebook trackers on Facebook.com/Messenger
- Twitter platform on Twitter.com/X.com
- LinkedIn tracking on LinkedIn.com

### Performance

- **Memory**: ~15 MB background, ~5 MB per tab
- **CPU**: <1% (native blocking engine)
- **Storage**: ~10 KB initial, ~50 KB after 1 week
- **Battery**: Minimal impact (no JavaScript callbacks for blocking)

## 📁 Project Structure

```
privaseer/
├── src/
│   ├── background/
│   │   ├── service-worker.ts       # Main coordinator
│   │   ├── firewall-engine.ts      # Blocking logic
│   │   ├── privacy-score.ts        # Score calculations
│   │   └── storage.ts              # Local data persistence
│   ├── content-scripts/
│   │   └── consent-scanner.ts      # Cookie banner detection
│   ├── popup/
│   │   ├── popup.html              # Popup page
│   │   └── popup.tsx               # React UI component
│   ├── types/
│   │   └── index.ts                # TypeScript types
│   └── utils/
│       ├── constants.ts            # Constants
│       └── logger.ts               # Logging utility
├── public/
│   ├── data/
│   │   ├── tracker-lists.json      # 120+ tracker domains
│   │   ├── privacy-rules.json      # GDPR rules
│   │   └── blocking-rules.json     # 30 blocking rules
│   └── icons/                      # Extension icons
├── dist/                           # Built extension (generated)
├── INSTALL.md                      # Installation guide
├── IMPROVEMENTS.md                 # v2.0 changelog
├── TROUBLESHOOTING.md              # Fix common issues
└── README.md                       # This file
```

## 🛠️ Development

### Prerequisites

- Node.js 18+
- npm 9+
- Chrome 91+

### Build Commands

```bash
# Install dependencies
npm install

# Build for production
npm run build

# Type checking
npm run typecheck

# Linting
npm run lint
```

### Hot Reload Workflow

1. Make changes to source files
2. Run `npm run build`
3. Go to `chrome://extensions/`
4. Click refresh icon on Privaseer
5. Reload any open tabs

## 🐛 Troubleshooting

### "Failed to fetch" Error

If you see console errors about failed fetches:

1. Rebuild: `npm run build`
2. Reload extension in `chrome://extensions/`
3. Refresh all open tabs

This happens if you installed v1.0 and are upgrading. The manifest now includes `web_accessible_resources` for content script access.

### Badge Not Showing

- Make sure you're on a regular website (not chrome:// pages)
- Check that protection is enabled (shield is blue)
- Visit a site with trackers (news sites work well)
- Badge is per-tab, switch tabs to see different counts

### Trackers Not Blocked

- Click shield button to ensure it's blue (enabled)
- Reload the webpage
- Check DevTools Network tab for blocked requests
- Some essential services are intentionally not blocked

### More Issues?

See [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for detailed solutions.

## 📊 Data Storage

All data stored in `chrome.storage.local`:

- **Privacy scores**: Current score, daily stats, 30-day history
- **Blocked trackers**: Domain, category, count, last blocked time
- **Alerts**: Last 100 alerts with timestamps
- **Settings**: Protection enabled, notification preferences

**Total storage**: ~50 KB after 1 week of use (10 MB quota available)

## 🔐 Security & Privacy

### Permissions Explained

- `storage`: Save privacy data locally
- `activeTab`: Get current page URL for alerts
- `declarativeNetRequest`: Block tracker requests
- `declarativeNetRequestFeedback`: Log blocked requests for scoring
- `tabs`: Monitor navigation for per-tab badges
- `<all_urls>`: Required to scan and block on all websites

### Privacy Guarantees

✅ **No external servers** - Everything runs on your device
✅ **No network requests** - Except the ones we block!
✅ **No user tracking** - We practice what we preach
✅ **No analytics** - Not even privacy-friendly ones
✅ **Open source** - Fully auditable code
✅ **No accounts** - Anonymous by default

### Comparison to Other Extensions

| Feature | Privaseer | uBlock Origin | Ghostery | Privacy Badger |
|---------|-----------|---------------|----------|----------------|
| Tracker Blocking | ✅ | ✅ | ✅ | ✅ |
| Privacy Score | ✅ | ❌ | ❌ | ❌ |
| Cookie Scanner | ✅ | ❌ | ❌ | ❌ |
| Tracker Info | ✅ | ❌ | ✅ | ❌ |
| Per-Tab Badges | ✅ | ❌ | ❌ | ❌ |
| 100% Local | ✅ | ✅ | ❌ | ✅ |
| Manifest V3 | ✅ | ❌ | ✅ | ❌ |

## 🤝 Contributing

Contributions welcome! Areas that need help:

1. **Tracker lists**: Add more domains to `tracker-lists.json`
2. **Cookie patterns**: Improve banner detection in `privacy-rules.json`
3. **Translations**: Multi-language support for consent scanner
4. **Testing**: Browser compatibility, edge cases
5. **Documentation**: Improve guides and examples

## 📜 License

MIT License - see LICENSE file for details

## 🙏 Credits

Built with:
- TypeScript
- React 18
- Vite
- Tailwind CSS
- Lucide Icons
- Chrome Extension APIs (Manifest V3)

Inspired by privacy-focused projects:
- EasyList
- Privacy Badger
- uBlock Origin
- Cookie AutoDelete

## 📞 Support

- **Issues**: Check [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
- **Questions**: Read [INSTALL.md](INSTALL.md)
- **Updates**: See [IMPROVEMENTS.md](IMPROVEMENTS.md)

## 🗺️ Roadmap

### v2.1 (Next)
- [ ] Custom whitelist (user exceptions)
- [ ] Statistics dashboard with charts
- [ ] Export/import settings

### v3.0 (Future)
- [ ] Multi-language support
- [ ] Cloud sync (optional)
- [ ] Advanced filtering rules
- [ ] Firefox port

---

**Built with ❤️ for privacy-conscious users**

Version: **2.1.0** | Last Updated: **2025-10-04** | Manifest: **V3**

## 📚 Documentation

- [README.md](README.md) - This file, main documentation
- [INSTALL.md](INSTALL.md) - Installation and setup guide
- [IMPROVEMENTS.md](IMPROVEMENTS.md) - v2.0 feature changelog
- [LOGGING_GUIDE.md](LOGGING_GUIDE.md) - Comprehensive logging system guide
- [ARCHITECTURE.md](ARCHITECTURE.md) - System architecture and design
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md) - Common issues and solutions
- [QUICK_FIX.md](QUICK_FIX.md) - Quick fix for "Failed to fetch" error

# Privaseer - Installation Guide

## Loading the Extension in Chrome

1. **Build the Extension**
   ```bash
   npm install
   npm run build
   ```

2. **Open Chrome Extensions Page**
   - Navigate to `chrome://extensions/` in your Chrome browser
   - Or click the three-dot menu → More Tools → Extensions

3. **Enable Developer Mode**
   - Toggle the "Developer mode" switch in the top-right corner

4. **Load Unpacked Extension**
   - Click "Load unpacked" button
   - Navigate to the `dist` folder in this project
   - Select the `dist` folder and click "Select"

5. **Verify Installation**
   - You should see "Privaseer" in your extensions list
   - The extension icon will appear in your Chrome toolbar
   - Click the icon to open the popup

## Using Privaseer

### Features

1. **Real-Time Tracker Blocking**
   - Automatically blocks known tracker domains
   - See blocked trackers in real-time
   - Badge shows count of blocked trackers

2. **Privacy Score**
   - Starts at 100/100
   - Decreases by 1 for each tracker blocked
   - Increases by 2 for visiting clean sites (no trackers)
   - Decreases by 5 for non-compliant cookie banners

3. **Cookie Consent Scanner**
   - Automatically scans pages for cookie banners
   - Checks if "Reject All" button is present and visible
   - Identifies deceptive dark patterns
   - Flags non-compliant sites

4. **Alert System**
   - Real-time alerts for blocked trackers
   - Notifications for deceptive cookie banners
   - Color-coded severity indicators:
     - 🟢 Green: Low severity (normal tracker)
     - 🟡 Yellow: Medium severity (non-compliant site)
     - 🔴 Red: High severity (high-risk tracker)

### Controls

- **Shield Icon (Top Right)**: Toggle protection on/off
- **Privacy Score**: Large number showing current score (0-100)
- **Recent Activity**: Scrollable list of recent blocks and alerts

## Data Storage

All data is stored locally using `chrome.storage.local`:
- Privacy scores and history
- Blocked tracker statistics
- Alert history (last 100 alerts)
- User settings

**No data leaves your device. Everything is 100% local.**

## Troubleshooting

### Extension Not Working

1. Check that Developer Mode is enabled
2. Verify the extension is enabled (toggle switch should be blue)
3. Try reloading the extension (click the refresh icon)
4. Check the Console for errors:
   - Right-click extension icon → Inspect popup
   - Go to `chrome://extensions/` → Click "Errors" button

### No Trackers Being Blocked

1. Visit a site known to have trackers (e.g., news sites, blogs)
2. Wait a few seconds for page to fully load
3. Check if protection is enabled (shield icon should be blue)
4. Open the popup to see activity

### Popup Not Updating

1. Close and reopen the popup
2. The popup auto-refreshes every 2 seconds
3. Check browser console for errors

## Development

### Project Structure

```
src/
  background/
    service-worker.ts       # Background service worker
    firewall-engine.ts      # Tracker blocking logic
    privacy-score.ts        # Score calculations
    storage.ts              # Data persistence
  content-scripts/
    consent-scanner.ts      # Cookie banner detection
  popup/
    popup.html              # Popup UI
    popup.tsx               # Popup React component
  types/
    index.ts                # TypeScript type definitions

public/
  data/
    tracker-lists.json      # Tracker domains database
    privacy-rules.json      # GDPR compliance rules
    blocking-rules.json     # Declarative blocking rules
  icons/                    # Extension icons
```

### Building for Production

```bash
npm run build
```

The `dist` folder will contain the production-ready extension.

### Hot Reload During Development

After making changes:
1. Run `npm run build`
2. Go to `chrome://extensions/`
3. Click the refresh icon on the Privaseer extension
4. Reload any open tabs to see changes

## Privacy & Security

- **100% Local Processing**: All data stays on your device
- **No External APIs**: No network requests except to blocked trackers
- **Open Source**: All code is visible and auditable
- **No Telemetry**: We don't collect any usage data
- **No Accounts**: No login or registration required

## Permissions Explained

- `storage`: Store privacy scores and settings locally
- `activeTab`: Check current page URL for alerts
- `declarativeNetRequest`: Block tracker requests
- `declarativeNetRequestFeedback`: Log blocked requests
- `tabs`: Access tab information for context
- `<all_urls>`: Monitor and block trackers on all sites

## Support

For issues or questions:
1. Check the Console for error messages
2. Review this installation guide
3. Verify all files built correctly in `dist` folder

## Version

Current Version: 2.0.0

## What's New in v2.0

- ✅ **Real Pause/Resume**: Shield button now actually pauses blocking
- ✅ **Per-Tab Badge**: Badge shows count specific to each tab
- ✅ **Expanded Tracker List**: 30+ blocking rules, 120+ tracker domains
- ✅ **Tracker Info**: Click info button to learn what trackers do and see alternatives
- ✅ **Better Code Quality**: Industry-standard architecture and practices

## Updating from v1.0

1. Pull latest code
2. Run `npm run build`
3. Reload extension in Chrome
4. All existing data preserved automatically

## Important Notes

### After Installing/Updating

If you see "Failed to fetch" errors in console:

1. Make sure you rebuilt: `npm run build`
2. Reload the extension in `chrome://extensions/`
3. Refresh any open tabs
4. The error should disappear

The extension now includes `web_accessible_resources` in the manifest to allow content scripts to access data files. This is required for the cookie consent scanner to work properly.

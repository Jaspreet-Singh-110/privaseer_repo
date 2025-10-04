# Troubleshooting Guide

## Error: Service Worker Registration Failed

### Problem
You see this error:
```
Service worker registration failed (Status code: 15)
Uncaught ReferenceError: window is not defined
```

### Root Cause
Service workers don't have access to the `window` object. Code trying to use `window.setTimeout` or `window.clearTimeout` will fail.

### Solution ✅
Use global `setTimeout` and `clearTimeout` instead of `window.setTimeout`:

```typescript
// ❌ Wrong (service worker)
window.setTimeout(() => {}, 1000);

// ✅ Correct (service worker)
setTimeout(() => {}, 1000);
```

### How to Apply Fix

1. **Rebuild the extension:**
   ```bash
   npm run build
   ```

2. **Reload the extension in Chrome:**
   - Go to `chrome://extensions/`
   - Find "Privaseer"
   - Click the refresh icon (🔄)

3. **Verify the fix:**
   - Check service worker console for errors
   - Extension should load without errors
   - All features should work

---

## Error: "Failed to fetch" in Content Scanner

### Problem
You see this error in the console:
```
Failed to initialize consent scanner: TypeError: Failed to fetch
```

### Root Cause
Content scripts run in a sandboxed environment and cannot directly access extension resources without explicit permission.

### Solution ✅
The manifest now includes `web_accessible_resources` which makes data files accessible to content scripts:

```json
"web_accessible_resources": [
  {
    "resources": [
      "data/privacy-rules.json",
      "data/tracker-lists.json",
      "data/blocking-rules.json"
    ],
    "matches": ["<all_urls>"]
  }
]
```

### How to Apply Fix

1. **Rebuild the extension:**
   ```bash
   npm run build
   ```

2. **Reload the extension in Chrome:**
   - Go to `chrome://extensions/`
   - Find "Privaseer"
   - Click the refresh icon (🔄)
   - Or remove and re-add the extension

3. **Verify the fix:**
   - Visit any website (e.g., https://www.bbc.co.uk)
   - Open DevTools Console (F12)
   - The error should be gone
   - You should see no console errors from consent-scanner

### What This Does

**Before Fix:**
```
Content Script → fetch('data/privacy-rules.json') → ❌ BLOCKED
```

**After Fix:**
```
Content Script → fetch(chrome.runtime.getURL('data/privacy-rules.json')) → ✅ ALLOWED
```

The `web_accessible_resources` directive tells Chrome: "Allow content scripts running on any URL to access these JSON files from the extension."

### Security Note

This is safe because:
1. Only JSON data files are exposed (no code)
2. Files are read-only
3. Only accessible by the extension's own content scripts
4. No sensitive data in the files (just tracker patterns)

---

## Other Common Issues

### Extension Icon Not Showing

**Problem:** Shield icon doesn't appear in toolbar

**Solution:**
1. Check that icon files exist in `dist/icons/`
2. Verify manifest.json has correct icon paths
3. Try reloading the extension

### Badge Not Updating

**Problem:** Badge count stuck or not showing

**Solution:**
1. Make sure you're on a website (not chrome:// page)
2. Check that protection is enabled (shield is blue)
3. Visit a site with known trackers (e.g., news sites)
4. Badge updates per-tab, switch tabs to see different counts

### Tracker Blocking Not Working

**Problem:** Trackers are not being blocked

**Solution:**
1. Check shield button - is it blue (enabled) or gray (paused)?
2. Click shield to toggle protection
3. Reload the webpage
4. Check DevTools Network tab to see blocked requests

### Popup Not Opening

**Problem:** Clicking extension icon does nothing

**Solution:**
1. Check browser console for errors
2. Verify `dist/src/popup/popup.html` exists
3. Rebuild: `npm run build`
4. Reload extension

### Build Failures

**Problem:** `npm run build` fails

**Solution:**
1. Delete `node_modules` and `dist` folders
2. Run `npm install`
3. Run `npm run build`
4. Check for TypeScript errors

---

## Verification Checklist

After fixing issues, verify everything works:

- [ ] Extension loads without errors
- [ ] Shield icon appears in toolbar
- [ ] Popup opens when clicking icon
- [ ] Badge shows count on websites with trackers
- [ ] Shield button toggles between blue/gray
- [ ] No console errors on any page
- [ ] Alerts appear in popup feed
- [ ] Privacy score updates
- [ ] Info buttons work on alerts

---

## Getting Help

If issues persist:

1. **Check browser console** (F12) for error messages
2. **Check extension console:**
   - Go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "background.html" under extension
   - Check for errors
3. **Rebuild from scratch:**
   ```bash
   rm -rf node_modules dist
   npm install
   npm run build
   ```

---

## Known Limitations

These are NOT bugs, they're expected behavior:

1. **Badge resets on browser restart** - Chrome limitation
2. **No blocking on chrome:// pages** - Chrome security policy
3. **Protection toggle requires page reload for some sites** - Cached resources
4. **Badge doesn't show on empty tabs** - No website to analyze

---

## Version Info

- **Current Version:** 2.0.0
- **Last Updated:** 2025-10-04
- **Chrome Version Required:** 91+
- **Manifest Version:** 3

---

## FAQ

**Q: Why does the extension need "<all_urls>" permission?**
A: To scan for cookie banners and block trackers on all websites you visit.

**Q: Is my data collected?**
A: No. Everything runs locally. Zero telemetry, zero external requests.

**Q: Can I use this on Firefox?**
A: Not yet. Firefox uses Manifest V2. A port may come in the future.

**Q: Why are some trackers not blocked?**
A: Some trackers are essential for website functionality (e.g., payment processors). We have a "never block" list to prevent breaking sites.

**Q: How do I report a bug?**
A: Check the console for errors and note the steps to reproduce.

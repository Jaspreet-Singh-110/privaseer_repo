// vite.config.ts
import { defineConfig } from "file:///home/project/node_modules/vite/dist/node/index.js";
import react from "file:///home/project/node_modules/@vitejs/plugin-react/dist/index.mjs";
import webExtension from "file:///home/project/node_modules/vite-plugin-web-extension/dist/index.js";

// src/manifest.json
var manifest_default = {
  manifest_version: 3,
  name: "Privaseer",
  version: "1.0.0",
  description: "Privacy-first browser extension with real-time tracker blocking, privacy scoring, and consent scanning",
  permissions: [
    "storage",
    "activeTab",
    "declarativeNetRequest",
    "declarativeNetRequestFeedback",
    "tabs"
  ],
  host_permissions: [
    "<all_urls>"
  ],
  background: {
    service_worker: "src/background/service-worker.ts",
    type: "module"
  },
  content_scripts: [
    {
      matches: ["http://*/*", "https://*/*"],
      js: ["src/content-scripts/consent-scanner.ts"],
      run_at: "document_idle"
    },
    {
      matches: ["http://*/*", "https://*/*"],
      js: ["src/content-scripts/email-autofill.ts"],
      run_at: "document_idle"
    }
  ],
  action: {
    default_popup: "src/popup/popup.html",
    default_icon: {
      "16": "icons/icon16.png",
      "32": "icons/icon32.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },
  icons: {
    "16": "icons/icon16.png",
    "32": "icons/icon32.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  },
  declarative_net_request: {
    rule_resources: [
      {
        id: "tracker_blocklist",
        enabled: true,
        path: "data/blocking-rules.json"
      }
    ]
  },
  web_accessible_resources: [
    {
      resources: [
        "data/privacy-rules.json",
        "data/tracker-lists.json",
        "data/blocking-rules.json"
      ],
      matches: ["<all_urls>"]
    }
  ]
};

// vite.config.ts
var vite_config_default = defineConfig({
  plugins: [
    react(),
    webExtension({
      manifest: "./src/manifest.json",
      disableAutoLaunch: true
    })
  ],
  optimizeDeps: {
    exclude: ["lucide-react"]
  },
  define: {
    "__APP_VERSION__": JSON.stringify(manifest_default.version)
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiLCAic3JjL21hbmlmZXN0Lmpzb24iXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvaG9tZS9wcm9qZWN0XCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCIvaG9tZS9wcm9qZWN0L3ZpdGUuY29uZmlnLnRzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9ob21lL3Byb2plY3Qvdml0ZS5jb25maWcudHNcIjtpbXBvcnQgeyBkZWZpbmVDb25maWcgfSBmcm9tICd2aXRlJztcbmltcG9ydCByZWFjdCBmcm9tICdAdml0ZWpzL3BsdWdpbi1yZWFjdCc7XG5pbXBvcnQgd2ViRXh0ZW5zaW9uIGZyb20gJ3ZpdGUtcGx1Z2luLXdlYi1leHRlbnNpb24nO1xuaW1wb3J0IG1hbmlmZXN0IGZyb20gJy4vc3JjL21hbmlmZXN0Lmpzb24nO1xuXG5leHBvcnQgZGVmYXVsdCBkZWZpbmVDb25maWcoe1xuICBwbHVnaW5zOiBbXG4gICAgcmVhY3QoKSxcbiAgICB3ZWJFeHRlbnNpb24oe1xuICAgICAgbWFuaWZlc3Q6ICcuL3NyYy9tYW5pZmVzdC5qc29uJyxcbiAgICAgIGRpc2FibGVBdXRvTGF1bmNoOiB0cnVlLFxuICAgIH0pLFxuICBdLFxuICBvcHRpbWl6ZURlcHM6IHtcbiAgICBleGNsdWRlOiBbJ2x1Y2lkZS1yZWFjdCddLFxuICB9LFxuICBkZWZpbmU6IHtcbiAgICAnX19BUFBfVkVSU0lPTl9fJzogSlNPTi5zdHJpbmdpZnkobWFuaWZlc3QudmVyc2lvbiksXG4gIH0sXG59KTtcbiIsICJ7XG4gIFwibWFuaWZlc3RfdmVyc2lvblwiOiAzLFxuICBcIm5hbWVcIjogXCJQcml2YXNlZXJcIixcbiAgXCJ2ZXJzaW9uXCI6IFwiMS4wLjBcIixcbiAgXCJkZXNjcmlwdGlvblwiOiBcIlByaXZhY3ktZmlyc3QgYnJvd3NlciBleHRlbnNpb24gd2l0aCByZWFsLXRpbWUgdHJhY2tlciBibG9ja2luZywgcHJpdmFjeSBzY29yaW5nLCBhbmQgY29uc2VudCBzY2FubmluZ1wiLFxuICBcInBlcm1pc3Npb25zXCI6IFtcbiAgICBcInN0b3JhZ2VcIixcbiAgICBcImFjdGl2ZVRhYlwiLFxuICAgIFwiZGVjbGFyYXRpdmVOZXRSZXF1ZXN0XCIsXG4gICAgXCJkZWNsYXJhdGl2ZU5ldFJlcXVlc3RGZWVkYmFja1wiLFxuICAgIFwidGFic1wiXG4gIF0sXG4gIFwiaG9zdF9wZXJtaXNzaW9uc1wiOiBbXG4gICAgXCI8YWxsX3VybHM+XCJcbiAgXSxcbiAgXCJiYWNrZ3JvdW5kXCI6IHtcbiAgICBcInNlcnZpY2Vfd29ya2VyXCI6IFwic3JjL2JhY2tncm91bmQvc2VydmljZS13b3JrZXIudHNcIixcbiAgICBcInR5cGVcIjogXCJtb2R1bGVcIlxuICB9LFxuICBcImNvbnRlbnRfc2NyaXB0c1wiOiBbXG4gICAge1xuICAgICAgXCJtYXRjaGVzXCI6IFtcImh0dHA6Ly8qLypcIiwgXCJodHRwczovLyovKlwiXSxcbiAgICAgIFwianNcIjogW1wic3JjL2NvbnRlbnQtc2NyaXB0cy9jb25zZW50LXNjYW5uZXIudHNcIl0sXG4gICAgICBcInJ1bl9hdFwiOiBcImRvY3VtZW50X2lkbGVcIlxuICAgIH0sXG4gICAge1xuICAgICAgXCJtYXRjaGVzXCI6IFtcImh0dHA6Ly8qLypcIiwgXCJodHRwczovLyovKlwiXSxcbiAgICAgIFwianNcIjogW1wic3JjL2NvbnRlbnQtc2NyaXB0cy9lbWFpbC1hdXRvZmlsbC50c1wiXSxcbiAgICAgIFwicnVuX2F0XCI6IFwiZG9jdW1lbnRfaWRsZVwiXG4gICAgfVxuICBdLFxuICBcImFjdGlvblwiOiB7XG4gICAgXCJkZWZhdWx0X3BvcHVwXCI6IFwic3JjL3BvcHVwL3BvcHVwLmh0bWxcIixcbiAgICBcImRlZmF1bHRfaWNvblwiOiB7XG4gICAgICBcIjE2XCI6IFwiaWNvbnMvaWNvbjE2LnBuZ1wiLFxuICAgICAgXCIzMlwiOiBcImljb25zL2ljb24zMi5wbmdcIixcbiAgICAgIFwiNDhcIjogXCJpY29ucy9pY29uNDgucG5nXCIsXG4gICAgICBcIjEyOFwiOiBcImljb25zL2ljb24xMjgucG5nXCJcbiAgICB9XG4gIH0sXG4gIFwiaWNvbnNcIjoge1xuICAgIFwiMTZcIjogXCJpY29ucy9pY29uMTYucG5nXCIsXG4gICAgXCIzMlwiOiBcImljb25zL2ljb24zMi5wbmdcIixcbiAgICBcIjQ4XCI6IFwiaWNvbnMvaWNvbjQ4LnBuZ1wiLFxuICAgIFwiMTI4XCI6IFwiaWNvbnMvaWNvbjEyOC5wbmdcIlxuICB9LFxuICBcImRlY2xhcmF0aXZlX25ldF9yZXF1ZXN0XCI6IHtcbiAgICBcInJ1bGVfcmVzb3VyY2VzXCI6IFtcbiAgICAgIHtcbiAgICAgICAgXCJpZFwiOiBcInRyYWNrZXJfYmxvY2tsaXN0XCIsXG4gICAgICAgIFwiZW5hYmxlZFwiOiB0cnVlLFxuICAgICAgICBcInBhdGhcIjogXCJkYXRhL2Jsb2NraW5nLXJ1bGVzLmpzb25cIlxuICAgICAgfVxuICAgIF1cbiAgfSxcbiAgXCJ3ZWJfYWNjZXNzaWJsZV9yZXNvdXJjZXNcIjogW1xuICAgIHtcbiAgICAgIFwicmVzb3VyY2VzXCI6IFtcbiAgICAgICAgXCJkYXRhL3ByaXZhY3ktcnVsZXMuanNvblwiLFxuICAgICAgICBcImRhdGEvdHJhY2tlci1saXN0cy5qc29uXCIsXG4gICAgICAgIFwiZGF0YS9ibG9ja2luZy1ydWxlcy5qc29uXCJcbiAgICAgIF0sXG4gICAgICBcIm1hdGNoZXNcIjogW1wiPGFsbF91cmxzPlwiXVxuICAgIH1cbiAgXVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjtBQUF5TixTQUFTLG9CQUFvQjtBQUN0UCxPQUFPLFdBQVc7QUFDbEIsT0FBTyxrQkFBa0I7OztBQ0Z6QjtBQUFBLEVBQ0Usa0JBQW9CO0FBQUEsRUFDcEIsTUFBUTtBQUFBLEVBQ1IsU0FBVztBQUFBLEVBQ1gsYUFBZTtBQUFBLEVBQ2YsYUFBZTtBQUFBLElBQ2I7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsRUFDRjtBQUFBLEVBQ0Esa0JBQW9CO0FBQUEsSUFDbEI7QUFBQSxFQUNGO0FBQUEsRUFDQSxZQUFjO0FBQUEsSUFDWixnQkFBa0I7QUFBQSxJQUNsQixNQUFRO0FBQUEsRUFDVjtBQUFBLEVBQ0EsaUJBQW1CO0FBQUEsSUFDakI7QUFBQSxNQUNFLFNBQVcsQ0FBQyxjQUFjLGFBQWE7QUFBQSxNQUN2QyxJQUFNLENBQUMsd0NBQXdDO0FBQUEsTUFDL0MsUUFBVTtBQUFBLElBQ1o7QUFBQSxJQUNBO0FBQUEsTUFDRSxTQUFXLENBQUMsY0FBYyxhQUFhO0FBQUEsTUFDdkMsSUFBTSxDQUFDLHVDQUF1QztBQUFBLE1BQzlDLFFBQVU7QUFBQSxJQUNaO0FBQUEsRUFDRjtBQUFBLEVBQ0EsUUFBVTtBQUFBLElBQ1IsZUFBaUI7QUFBQSxJQUNqQixjQUFnQjtBQUFBLE1BQ2QsTUFBTTtBQUFBLE1BQ04sTUFBTTtBQUFBLE1BQ04sTUFBTTtBQUFBLE1BQ04sT0FBTztBQUFBLElBQ1Q7QUFBQSxFQUNGO0FBQUEsRUFDQSxPQUFTO0FBQUEsSUFDUCxNQUFNO0FBQUEsSUFDTixNQUFNO0FBQUEsSUFDTixNQUFNO0FBQUEsSUFDTixPQUFPO0FBQUEsRUFDVDtBQUFBLEVBQ0EseUJBQTJCO0FBQUEsSUFDekIsZ0JBQWtCO0FBQUEsTUFDaEI7QUFBQSxRQUNFLElBQU07QUFBQSxRQUNOLFNBQVc7QUFBQSxRQUNYLE1BQVE7QUFBQSxNQUNWO0FBQUEsSUFDRjtBQUFBLEVBQ0Y7QUFBQSxFQUNBLDBCQUE0QjtBQUFBLElBQzFCO0FBQUEsTUFDRSxXQUFhO0FBQUEsUUFDWDtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRjtBQUFBLE1BQ0EsU0FBVyxDQUFDLFlBQVk7QUFBQSxJQUMxQjtBQUFBLEVBQ0Y7QUFDRjs7O0FENURBLElBQU8sc0JBQVEsYUFBYTtBQUFBLEVBQzFCLFNBQVM7QUFBQSxJQUNQLE1BQU07QUFBQSxJQUNOLGFBQWE7QUFBQSxNQUNYLFVBQVU7QUFBQSxNQUNWLG1CQUFtQjtBQUFBLElBQ3JCLENBQUM7QUFBQSxFQUNIO0FBQUEsRUFDQSxjQUFjO0FBQUEsSUFDWixTQUFTLENBQUMsY0FBYztBQUFBLEVBQzFCO0FBQUEsRUFDQSxRQUFRO0FBQUEsSUFDTixtQkFBbUIsS0FBSyxVQUFVLGlCQUFTLE9BQU87QUFBQSxFQUNwRDtBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==

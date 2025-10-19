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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiLCAic3JjL21hbmlmZXN0Lmpzb24iXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvaG9tZS9wcm9qZWN0XCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCIvaG9tZS9wcm9qZWN0L3ZpdGUuY29uZmlnLnRzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9ob21lL3Byb2plY3Qvdml0ZS5jb25maWcudHNcIjtpbXBvcnQgeyBkZWZpbmVDb25maWcgfSBmcm9tICd2aXRlJztcbmltcG9ydCByZWFjdCBmcm9tICdAdml0ZWpzL3BsdWdpbi1yZWFjdCc7XG5pbXBvcnQgd2ViRXh0ZW5zaW9uIGZyb20gJ3ZpdGUtcGx1Z2luLXdlYi1leHRlbnNpb24nO1xuaW1wb3J0IG1hbmlmZXN0IGZyb20gJy4vc3JjL21hbmlmZXN0Lmpzb24nO1xuXG5leHBvcnQgZGVmYXVsdCBkZWZpbmVDb25maWcoe1xuICBwbHVnaW5zOiBbXG4gICAgcmVhY3QoKSxcbiAgICB3ZWJFeHRlbnNpb24oe1xuICAgICAgbWFuaWZlc3Q6ICcuL3NyYy9tYW5pZmVzdC5qc29uJyxcbiAgICAgIGRpc2FibGVBdXRvTGF1bmNoOiB0cnVlLFxuICAgIH0pLFxuICBdLFxuICBvcHRpbWl6ZURlcHM6IHtcbiAgICBleGNsdWRlOiBbJ2x1Y2lkZS1yZWFjdCddLFxuICB9LFxuICBkZWZpbmU6IHtcbiAgICAnX19BUFBfVkVSU0lPTl9fJzogSlNPTi5zdHJpbmdpZnkobWFuaWZlc3QudmVyc2lvbiksXG4gIH0sXG59KTtcbiIsICJ7XG4gIFwibWFuaWZlc3RfdmVyc2lvblwiOiAzLFxuICBcIm5hbWVcIjogXCJQcml2YXNlZXJcIixcbiAgXCJ2ZXJzaW9uXCI6IFwiMS4wLjBcIixcbiAgXCJkZXNjcmlwdGlvblwiOiBcIlByaXZhY3ktZmlyc3QgYnJvd3NlciBleHRlbnNpb24gd2l0aCByZWFsLXRpbWUgdHJhY2tlciBibG9ja2luZywgcHJpdmFjeSBzY29yaW5nLCBhbmQgY29uc2VudCBzY2FubmluZ1wiLFxuICBcInBlcm1pc3Npb25zXCI6IFtcbiAgICBcInN0b3JhZ2VcIixcbiAgICBcImFjdGl2ZVRhYlwiLFxuICAgIFwiZGVjbGFyYXRpdmVOZXRSZXF1ZXN0XCIsXG4gICAgXCJkZWNsYXJhdGl2ZU5ldFJlcXVlc3RGZWVkYmFja1wiLFxuICAgIFwidGFic1wiXG4gIF0sXG4gIFwiaG9zdF9wZXJtaXNzaW9uc1wiOiBbXG4gICAgXCI8YWxsX3VybHM+XCJcbiAgXSxcbiAgXCJiYWNrZ3JvdW5kXCI6IHtcbiAgICBcInNlcnZpY2Vfd29ya2VyXCI6IFwic3JjL2JhY2tncm91bmQvc2VydmljZS13b3JrZXIudHNcIixcbiAgICBcInR5cGVcIjogXCJtb2R1bGVcIlxuICB9LFxuICBcImNvbnRlbnRfc2NyaXB0c1wiOiBbXG4gICAge1xuICAgICAgXCJtYXRjaGVzXCI6IFtcImh0dHA6Ly8qLypcIiwgXCJodHRwczovLyovKlwiXSxcbiAgICAgIFwianNcIjogW1wic3JjL2NvbnRlbnQtc2NyaXB0cy9jb25zZW50LXNjYW5uZXIudHNcIl0sXG4gICAgICBcInJ1bl9hdFwiOiBcImRvY3VtZW50X2lkbGVcIlxuICAgIH1cbiAgXSxcbiAgXCJhY3Rpb25cIjoge1xuICAgIFwiZGVmYXVsdF9wb3B1cFwiOiBcInNyYy9wb3B1cC9wb3B1cC5odG1sXCIsXG4gICAgXCJkZWZhdWx0X2ljb25cIjoge1xuICAgICAgXCIxNlwiOiBcImljb25zL2ljb24xNi5wbmdcIixcbiAgICAgIFwiMzJcIjogXCJpY29ucy9pY29uMzIucG5nXCIsXG4gICAgICBcIjQ4XCI6IFwiaWNvbnMvaWNvbjQ4LnBuZ1wiLFxuICAgICAgXCIxMjhcIjogXCJpY29ucy9pY29uMTI4LnBuZ1wiXG4gICAgfVxuICB9LFxuICBcImljb25zXCI6IHtcbiAgICBcIjE2XCI6IFwiaWNvbnMvaWNvbjE2LnBuZ1wiLFxuICAgIFwiMzJcIjogXCJpY29ucy9pY29uMzIucG5nXCIsXG4gICAgXCI0OFwiOiBcImljb25zL2ljb240OC5wbmdcIixcbiAgICBcIjEyOFwiOiBcImljb25zL2ljb24xMjgucG5nXCJcbiAgfSxcbiAgXCJkZWNsYXJhdGl2ZV9uZXRfcmVxdWVzdFwiOiB7XG4gICAgXCJydWxlX3Jlc291cmNlc1wiOiBbXG4gICAgICB7XG4gICAgICAgIFwiaWRcIjogXCJ0cmFja2VyX2Jsb2NrbGlzdFwiLFxuICAgICAgICBcImVuYWJsZWRcIjogdHJ1ZSxcbiAgICAgICAgXCJwYXRoXCI6IFwiZGF0YS9ibG9ja2luZy1ydWxlcy5qc29uXCJcbiAgICAgIH1cbiAgICBdXG4gIH0sXG4gIFwid2ViX2FjY2Vzc2libGVfcmVzb3VyY2VzXCI6IFtcbiAgICB7XG4gICAgICBcInJlc291cmNlc1wiOiBbXG4gICAgICAgIFwiZGF0YS9wcml2YWN5LXJ1bGVzLmpzb25cIixcbiAgICAgICAgXCJkYXRhL3RyYWNrZXItbGlzdHMuanNvblwiLFxuICAgICAgICBcImRhdGEvYmxvY2tpbmctcnVsZXMuanNvblwiXG4gICAgICBdLFxuICAgICAgXCJtYXRjaGVzXCI6IFtcIjxhbGxfdXJscz5cIl1cbiAgICB9XG4gIF1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7QUFBeU4sU0FBUyxvQkFBb0I7QUFDdFAsT0FBTyxXQUFXO0FBQ2xCLE9BQU8sa0JBQWtCOzs7QUNGekI7QUFBQSxFQUNFLGtCQUFvQjtBQUFBLEVBQ3BCLE1BQVE7QUFBQSxFQUNSLFNBQVc7QUFBQSxFQUNYLGFBQWU7QUFBQSxFQUNmLGFBQWU7QUFBQSxJQUNiO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLEVBQ0Y7QUFBQSxFQUNBLGtCQUFvQjtBQUFBLElBQ2xCO0FBQUEsRUFDRjtBQUFBLEVBQ0EsWUFBYztBQUFBLElBQ1osZ0JBQWtCO0FBQUEsSUFDbEIsTUFBUTtBQUFBLEVBQ1Y7QUFBQSxFQUNBLGlCQUFtQjtBQUFBLElBQ2pCO0FBQUEsTUFDRSxTQUFXLENBQUMsY0FBYyxhQUFhO0FBQUEsTUFDdkMsSUFBTSxDQUFDLHdDQUF3QztBQUFBLE1BQy9DLFFBQVU7QUFBQSxJQUNaO0FBQUEsRUFDRjtBQUFBLEVBQ0EsUUFBVTtBQUFBLElBQ1IsZUFBaUI7QUFBQSxJQUNqQixjQUFnQjtBQUFBLE1BQ2QsTUFBTTtBQUFBLE1BQ04sTUFBTTtBQUFBLE1BQ04sTUFBTTtBQUFBLE1BQ04sT0FBTztBQUFBLElBQ1Q7QUFBQSxFQUNGO0FBQUEsRUFDQSxPQUFTO0FBQUEsSUFDUCxNQUFNO0FBQUEsSUFDTixNQUFNO0FBQUEsSUFDTixNQUFNO0FBQUEsSUFDTixPQUFPO0FBQUEsRUFDVDtBQUFBLEVBQ0EseUJBQTJCO0FBQUEsSUFDekIsZ0JBQWtCO0FBQUEsTUFDaEI7QUFBQSxRQUNFLElBQU07QUFBQSxRQUNOLFNBQVc7QUFBQSxRQUNYLE1BQVE7QUFBQSxNQUNWO0FBQUEsSUFDRjtBQUFBLEVBQ0Y7QUFBQSxFQUNBLDBCQUE0QjtBQUFBLElBQzFCO0FBQUEsTUFDRSxXQUFhO0FBQUEsUUFDWDtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRjtBQUFBLE1BQ0EsU0FBVyxDQUFDLFlBQVk7QUFBQSxJQUMxQjtBQUFBLEVBQ0Y7QUFDRjs7O0FEdkRBLElBQU8sc0JBQVEsYUFBYTtBQUFBLEVBQzFCLFNBQVM7QUFBQSxJQUNQLE1BQU07QUFBQSxJQUNOLGFBQWE7QUFBQSxNQUNYLFVBQVU7QUFBQSxNQUNWLG1CQUFtQjtBQUFBLElBQ3JCLENBQUM7QUFBQSxFQUNIO0FBQUEsRUFDQSxjQUFjO0FBQUEsSUFDWixTQUFTLENBQUMsY0FBYztBQUFBLEVBQzFCO0FBQUEsRUFDQSxRQUFRO0FBQUEsSUFDTixtQkFBbUIsS0FBSyxVQUFVLGlCQUFTLE9BQU87QUFBQSxFQUNwRDtBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==

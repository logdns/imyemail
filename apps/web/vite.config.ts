import path from "node:path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

const assetBase = (process.env.VITE_ASSET_BASE || "/").replace(/\/?$/, "/")

export default defineConfig({
  base: assetBase,
  plugins: [react(), {
    name: "imyemail-cdn-fallback",
    transformIndexHtml: {
      order: "post",
      handler(html) {
        if (!assetBase.startsWith("https://cdn.jsdelivr.net/")) return html
        const escapedBase = assetBase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        return html
          .replace(new RegExp(`${escapedBase}favicon\\.svg`, "g"), "/favicon.svg")
          .replace(new RegExp(`<script type="module" crossorigin src="${escapedBase}assets/app\\.js"></script>`), `<script type="module">import("${assetBase}assets/app.js").catch(()=>import("/assets/app.js"))</script>`)
          .replace(new RegExp(`<link rel="stylesheet" crossorigin href="(${escapedBase}assets/[^"]+\\.css)">`, "g"), `<link rel="stylesheet" crossorigin href="$1" onerror="this.onerror=null;this.href=this.href.replace(/^https:\\/\\/cdn\\.jsdelivr\\.net\\/gh\\/logdns\\/imyemail@[^/]+\\/apps\\/web\\/dist/, '')">`)
      },
    },
  }],
  build: {
    rollupOptions: {
      output: {
        entryFileNames: "assets/app.js",
        chunkFileNames: "assets/[name].js",
        assetFileNames: "assets/[name][extname]",
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:8080",
      "/healthz": "http://localhost:8080",
    },
  },
})

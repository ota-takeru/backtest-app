import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    proxy: {
      // J-Quants APIへのリクエストをプロキシする
      // 例: /jquants-api/v1/prices/daily_quotes -> https://api.jquants.com/v1/prices/daily_quotes
      "/jquants-api": {
        target: "https://api.jquants.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/jquants-api/, ""),
      },
    },
  },
  worker: {
    format: "es",
    plugins: () => [
      // ワーカー用のプラグイン (もしあれば)
    ],
    rollupOptions: {
      // ワーカー用のRollupオプション (もしあれば)
    },
  },
});

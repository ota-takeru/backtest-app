/// <reference types="vitest" />
import {
  defineConfig as defineViteConfig,
  UserConfig as ViteUserConfig,
} from "vite";
import {
  defineConfig as defineVitestConfig,
  UserConfig as VitestUserConfig,
} from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";
import tailwindcss from "@tailwindcss/vite";

const vitestConfig: VitestUserConfig = {
  test: {
    globals: true,
    environment: "happy-dom", // or 'jsdom'
    include: ["src/**/*.{test,spec}.?(c|m)[jt]s?(x)"],
    benchmark: {
      include: ["src/**/*.{bench,benchmark}.?(c|m)[jt]s?(x)"],
      reporters: ["default"],
      outputFile: "bench/report.json",
    },
  },
};

export default defineViteConfig({
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
      output: {
        // ハッシュを含まない固定のファイル名で出力
        entryFileNames: `worker.js`, // worker.js として出力
        // chunkFileNames と assetFileNames も必要に応じて設定
        chunkFileNames: `assets/worker-chunk-[hash].js`,
        assetFileNames: `assets/worker-asset-[hash].[ext]`,
      },
    },
  },
  // Vitest configuration
  // @ts-ignore
  test: vitestConfig.test,
} as ViteUserConfig & { test: VitestUserConfig["test"] });

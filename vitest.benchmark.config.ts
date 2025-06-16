import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    include: [
      "tests/performance/**/*.{bench,benchmark}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}",
    ],
    exclude: ["node_modules", "dist"],
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
      "@tests": resolve(__dirname, "./tests"),
    },
  },
  esbuild: {
    target: "node18",
  },
});

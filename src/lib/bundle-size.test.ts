import { describe, it, expect } from "vitest";
import { readFileSync, statSync, existsSync } from "fs";
import { join } from "path";
import { gzipSync } from "zlib";

describe("Bundle Size Tests", () => {
  const distPath = join(process.cwd(), "dist");

  it("should have gzip bundle size < 3.7 MB", async () => {
    // Build the application first if dist doesn't exist
    try {
      const indexHtml = readFileSync(join(distPath, "index.html"), "utf-8");

      // Extract all JS bundle file names from index.html
      const jsFileMatches =
        indexHtml.match(/src="\/assets\/([^"]+\.js)"/g) || [];
      const jsFileNames = jsFileMatches.map((match) =>
        match.replace(/src="\/assets\/([^"]+\.js)"/, "$1")
      );

      if (jsFileNames.length === 0) {
        throw new Error("No JS bundles found in index.html");
      }

      let totalGzipSize = 0;
      let totalUncompressedSize = 0;

      // Calculate gzip size for all JS files
      for (const jsFileName of jsFileNames) {
        const jsFilePath = join(distPath, "assets", jsFileName);
        if (!existsSync(jsFilePath)) {
          console.warn(`JS file not found: ${jsFilePath}`);
          continue;
        }

        const jsContent = readFileSync(jsFilePath);
        const gzippedContent = gzipSync(jsContent);

        totalGzipSize += gzippedContent.length;
        totalUncompressedSize += jsContent.length;
      }

      const totalGzipSizeMB = totalGzipSize / (1024 * 1024);
      const totalUncompressedSizeMB = totalUncompressedSize / (1024 * 1024);
      const compressionRatio = totalUncompressedSize / totalGzipSize;

      console.log(
        `Total bundle size (uncompressed): ${totalUncompressedSizeMB.toFixed(
          2
        )} MB`
      );
      console.log(`Total bundle size (gzip): ${totalGzipSizeMB.toFixed(2)} MB`);
      console.log(`Compression ratio: ${compressionRatio.toFixed(2)}x`);

      // Check if gzip size is under 3.7MB threshold
      expect(totalGzipSizeMB).toBeLessThan(3.7);

      // Also check compression ratio is reasonable (should be at least 3x)
      expect(compressionRatio).toBeGreaterThan(3.0);
    } catch (error: any) {
      // If dist doesn't exist, run build first
      if (error.code === "ENOENT") {
        throw new Error(
          "Build artifacts not found. Run 'npm run build' first."
        );
      }
      throw error;
    }
  });

  it("should have reasonable chunk sizes", async () => {
    try {
      const indexHtml = readFileSync(join(distPath, "index.html"), "utf-8");

      // Check for reasonable number of chunks
      const jsChunks = indexHtml.match(/src="\/assets\/[^"]+\.js"/g) || [];
      const cssChunks = indexHtml.match(/href="\/assets\/[^"]+\.css"/g) || [];

      console.log(
        `JS chunks: ${jsChunks.length}, CSS chunks: ${cssChunks.length}`
      );

      // Should have reasonable number of chunks (not too many, not too few)
      expect(jsChunks.length).toBeGreaterThan(0);
      expect(jsChunks.length).toBeLessThan(10); // Avoid too much fragmentation
    } catch (error: any) {
      if (error.code === "ENOENT") {
        throw new Error(
          "Build artifacts not found. Run 'npm run build' first."
        );
      }
      throw error;
    }
  });

  it("should load DuckDB-WASM assets efficiently", async () => {
    // Check if worker files are properly separated
    try {
      const workerFiles = readFileSync(join(distPath, "worker.js"), "utf-8");

      // Worker file should exist and be reasonably sized
      const stats = statSync(join(distPath, "worker.js"));
      const workerSizeMB = stats.size / (1024 * 1024);

      console.log(`Worker size: ${workerSizeMB.toFixed(2)} MB`);

      // Worker should be under 1MB for efficient loading
      expect(workerSizeMB).toBeLessThan(1.0);
    } catch (error: any) {
      if (error.code === "ENOENT") {
        throw new Error(
          "Worker build artifacts not found. Check build configuration."
        );
      }
      throw error;
    }
  });
});

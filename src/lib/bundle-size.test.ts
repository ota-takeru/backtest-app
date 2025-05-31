import { describe, it, expect } from "vitest";
import { readFileSync, statSync } from "fs";
import { join } from "path";

describe("Bundle Size Tests", () => {
  const distPath = join(process.cwd(), "dist");
  
  it("should have gzip bundle size < 3.7 MB", async () => {
    // Build the application first if dist doesn't exist
    try {
      const indexHtml = readFileSync(join(distPath, "index.html"), "utf-8");
      
      // Extract main JS bundle file name from index.html
      const jsFileMatch = indexHtml.match(/src="\/assets\/([^"]+\.js)"/);
      if (!jsFileMatch) {
        throw new Error("Main JS bundle not found in index.html");
      }
      
      const jsFileName = jsFileMatch[1];
      const jsFilePath = join(distPath, "assets", jsFileName);
      
      // Get file size
      const stats = statSync(jsFilePath);
      const fileSizeBytes = stats.size;
      const fileSizeMB = fileSizeBytes / (1024 * 1024);
      
      console.log(`Bundle size: ${fileSizeMB.toFixed(2)} MB`);
      
      // Check if size is under 3.7MB threshold
      expect(fileSizeMB).toBeLessThan(3.7);
      
    } catch (error) {
      // If dist doesn't exist, run build first
      if (error.code === 'ENOENT') {
        throw new Error("Build artifacts not found. Run 'npm run build' first.");
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
      
      console.log(`JS chunks: ${jsChunks.length}, CSS chunks: ${cssChunks.length}`);
      
      // Should have reasonable number of chunks (not too many, not too few)
      expect(jsChunks.length).toBeGreaterThan(0);
      expect(jsChunks.length).toBeLessThan(10); // Avoid too much fragmentation
      
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error("Build artifacts not found. Run 'npm run build' first.");
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
      
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error("Worker build artifacts not found. Check build configuration.");
      }
      throw error;
    }
  });
});

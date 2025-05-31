import { vi } from "vitest";

// Setup for integration tests with real DuckDB
global.setImmediate =
  global.setImmediate ||
  ((fn: any, ...args: any[]) => setTimeout(fn, 0, ...args));

// Mock only necessary APIs for Node.js environment
Object.defineProperty(global, "fetch", {
  value: vi.fn(),
  configurable: true,
});

// Suppress console logs during integration tests unless debugging
const originalLog = console.log;
const originalWarn = console.warn;

if (!process.env.DEBUG_TESTS) {
  console.log = vi.fn();
  console.warn = vi.fn();
}

// Restore console for actual errors
const originalError = console.error;
console.error = (...args) => {
  originalError(...args);
};

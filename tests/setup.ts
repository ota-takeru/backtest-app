import { vi } from "vitest";

// Mock Web Workers for testing
global.Worker = vi.fn().mockImplementation(() => ({
  postMessage: vi.fn(),
  terminate: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
}));

// Mock performance API for memory testing
Object.defineProperty(global, "performance", {
  value: {
    ...global.performance,
    memory: {
      usedJSHeapSize: 50 * 1024 * 1024, // 50MB baseline
      totalJSHeapSize: 100 * 1024 * 1024,
      jsHeapSizeLimit: 2 * 1024 * 1024 * 1024, // 2GB
    },
    now: () => Date.now(),
    mark: vi.fn(),
    measure: vi.fn(),
    getEntriesByName: vi.fn().mockReturnValue([]),
    getEntriesByType: vi.fn().mockReturnValue([]),
  },
  configurable: true,
});

// Mock IndexedDB for testing
Object.defineProperty(global, "indexedDB", {
  value: {
    open: vi.fn().mockResolvedValue({
      result: {
        objectStoreNames: [],
        createObjectStore: vi.fn(),
        transaction: vi.fn().mockReturnValue({
          objectStore: vi.fn().mockReturnValue({
            add: vi.fn().mockResolvedValue(undefined),
            get: vi.fn().mockResolvedValue(undefined),
            put: vi.fn().mockResolvedValue(undefined),
            delete: vi.fn().mockResolvedValue(undefined),
          }),
        }),
      },
    }),
  },
  configurable: true,
});

// Mock fetch for API testing
global.fetch = vi.fn();

// Setup console to capture errors during testing
const originalError = console.error;
console.error = (...args) => {
  // Only log actual errors, not expected test errors
  if (!args[0]?.toString().includes("Expected error")) {
    originalError(...args);
  }
};

// Increase timeout for integration tests
vi.setConfig({
  testTimeout: 30000,
  hookTimeout: 30000,
});

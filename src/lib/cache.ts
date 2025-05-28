// src/lib/cache.ts
import { BacktestResponse } from "./types";

const DB_NAME = "backtestCache";
const DB_VERSION = 1;
const DATA_STORE_NAME = "marketData";
const RESULT_STORE_NAME = "backtestResults";

interface MarketDataRecord {
  key: string; // e.g., "symbol_start_end" or a hash of ohlcData
  data: any; // OHLCFrameJSON
  timestamp: number;
}

interface BacktestResultRecord {
  key: string; // e.g., hash of (dsl + ohlcDataKey)
  result: BacktestResponse;
  timestamp: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function getDB(): Promise<IDBDatabase> {
  if (dbPromise) {
    return dbPromise;
  }
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error("IndexedDB error:", request.error);
      reject("IndexedDB error: " + request.error);
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(DATA_STORE_NAME)) {
        db.createObjectStore(DATA_STORE_NAME, { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains(RESULT_STORE_NAME)) {
        db.createObjectStore(RESULT_STORE_NAME, { keyPath: "key" });
      }
    };
  });
  return dbPromise;
}

export async function getCachedData<T>(
  storeName: string,
  key: string
): Promise<T | null> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, "readonly");
    const store = transaction.objectStore(storeName);
    const request = store.get(key);

    request.onerror = () => {
      console.error(
        `Error fetching data for key ${key} from ${storeName}`,
        request.error
      );
      reject(request.error);
    };

    request.onsuccess = () => {
      if (request.result) {
        resolve(request.result.data as T); // Assuming 'data' field holds the actual cached object
      } else {
        resolve(null);
      }
    };
  });
}

export async function setCachedData(
  storeName: string,
  key: string,
  data: any
): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);
    const record = { key, data, timestamp: Date.now() };
    const request = store.put(record);

    request.onerror = () => {
      console.error(
        `Error saving data for key ${key} to ${storeName}`,
        request.error
      );
      reject(request.error);
    };

    request.onsuccess = () => {
      resolve();
    };
  });
}

// Helper function to generate a simple hash (Not cryptographically secure)
export async function generateCacheKey(data: object): Promise<string> {
  const jsonString = JSON.stringify(data);
  // For browsers:
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const msgUint8 = new TextEncoder().encode(jsonString); // encode as (utf-8) Uint8Array
    const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8); // hash the message
    const hashArray = Array.from(new Uint8Array(hashBuffer)); // convert buffer to byte array
    const hashHex = hashArray
      .map((b) => b.toString(16).padStart(2, "0"))
      .join(""); // convert bytes to hex string
    return hashHex;
  }
  // Fallback for environments without crypto.subtle (e.g., older node or some web workers without secure context)
  // This is a very simple hash and prone to collisions for different inputs.
  // Consider a more robust hashing library if crypto.subtle is not available.
  let hash = 0;
  for (let i = 0; i < jsonString.length; i++) {
    const char = jsonString.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32bit integer
  }
  return hash.toString();
}

export const MARKET_DATA_STORE = DATA_STORE_NAME;
export const RESULT_STORE = RESULT_STORE_NAME;

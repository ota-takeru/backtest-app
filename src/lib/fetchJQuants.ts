import { openDB } from "idb";
import { OHLCFrameJSON } from "./types";
// useApiKeys cannot be used here directly.

const DB_NAME = "ohlc-cache";
const STORE = "frames";
const CACHE_VERSION = 3;

async function getDB() {
  return openDB(DB_NAME, CACHE_VERSION, {
    upgrade(db, oldVersion) {
      if (oldVersion < CACHE_VERSION) {
        if (db.objectStoreNames.contains(STORE)) {
          db.deleteObjectStore(STORE);
        }
      }
      db.createObjectStore(STORE);
    },
  });
}

// This function is now designed to be called from a context that can manage state (e.g., App.tsx)
export async function refreshJQuantsIdTokenLogic(
  refreshToken: string
): Promise<{ newIdToken: string; newRefreshToken?: string } | null> {
  if (!refreshToken) {
    console.error("J-Quants Refresh Token is missing for ID token refresh.");
    return null;
  }

  console.log("[refreshJQuantsIdTokenLogic] Attempting to refresh ID token...");

  // ▼ ここでクエリに付与
  const url = new URL(
    "/jquants-api/v1/token/auth_refresh",
    window.location.origin
  );
  url.searchParams.set("refreshtoken", refreshToken);

  try {
    const res = await fetch(url.toString(), { method: "POST" }); // ヘッダと body は不要
    const text = await res.text();

    if (!res.ok) {
      throw new Error(
        `Refresh token API call failed: ${res.status} ${res.statusText}. Body: ${text}`
      );
    }

    const data = JSON.parse(text);
    if (!data.idToken)
      throw new Error("idToken not found in refresh response.");

    return { newIdToken: data.idToken, newRefreshToken: data.refreshToken };
  } catch (err) {
    console.error(
      "[refreshJQuantsIdTokenLogic] Error during token refresh:",
      err
    );
    return null;
  }
}

// fetchFromAPI now simply tries to fetch with the given idToken.
// It will throw an error on 401, which the caller (fetchOHLC) should catch and handle.
async function fetchFromAPI(
  idToken: string,
  code: string,
  from: string,
  to: string
): Promise<OHLCFrameJSON | null> {
  console.log(
    `[fetchFromAPI] Attempting fetch for ${code} with idToken (first 10 chars): ${
      idToken ? idToken.substring(0, 10) : "MISSING"
    }`
  );
  if (!idToken) {
    throw new Error("J-Quants ID Token is missing for API call."); // Should be caught by caller
  }

  try {
    const apiUrl = new URL(
      "/jquants-api/v1/prices/daily_quotes",
      window.location.origin
    );
    const codeForApi = code.replace(".T", "");
    apiUrl.searchParams.set("code", codeForApi);
    apiUrl.searchParams.set("from", from);
    apiUrl.searchParams.set("to", to);

    const res = await fetch(apiUrl.toString(), {
      headers: { Authorization: `Bearer ${idToken}` },
    });

    const responseText = await res.text();

    if (res.status === 401) {
      console.warn(
        `[fetchFromAPI] Received 401 Unauthorized for ${code}. Token might be expired.`
      );
      // Throw a specific error or return a marker for the caller to initiate refresh
      const err = new Error("IDTokenExpiredOrInvalid");
      // @ts-ignore
      err.status = 401;
      throw err;
    }
    if (!res.ok) {
      throw new Error(
        `J-Quants API Error for ${code}: ${res.status} ${res.statusText}. Response: ${responseText}`
      );
    }

    const json = JSON.parse(responseText);
    if (!json.daily_quotes) {
      console.warn(`[fetchFromAPI] No daily_quotes in response for ${code}.`);
      return null;
    }
    const quotes = json.daily_quotes as any[];
    if (quotes.length === 0) {
      console.log(`[fetchFromAPI] Empty daily_quotes for ${code}.`);
      return null;
    }

    const index: string[] = [];
    const data: number[][] = [];
    quotes.forEach((q) => {
      index.push(q.Date);
      data.push([
        parseFloat(q.Open),
        parseFloat(q.High),
        parseFloat(q.Low),
        parseFloat(q.Close),
        parseFloat(q.Volume),
      ]);
    });
    return {
      code,
      columns: ["Open", "High", "Low", "Close", "Volume"],
      index,
      data,
    };
  } catch (err) {
    console.error(`[fetchFromAPI] Error during fetch for ${code}:`, err);
    throw err; // Re-throw to be caught by fetchOHLC
  }
}

export async function fetchOHLC(
  idToken: string,
  refreshToken: string, // Needed for refresh callback
  onIdTokenRefreshed: (newIdToken: string, newRefreshToken?: string) => void, // Callback to update tokens in App state
  code: string,
  start: string,
  end: string
): Promise<OHLCFrameJSON | null> {
  const db = await getDB();
  const cacheKey = `${code}_${start}_${end}`;
  try {
    const cached = await db.get(STORE, cacheKey);
    if (cached) return cached as OHLCFrameJSON;
  } catch (e) {
    console.warn("IndexedDB cache read error:", e);
  }

  try {
    const data = await fetchFromAPI(idToken, code, start, end);
    if (data)
      await db
        .put(STORE, data, cacheKey)
        .catch((e) => console.warn("DB write error:", e));
    return data;
  } catch (error: any) {
    // @ts-ignore
    if (
      error.status === 401 ||
      (error.message && error.message.includes("IDTokenExpiredOrInvalid"))
    ) {
      console.warn(
        "Attempting token refresh due to 401 or token missing error..."
      );
      const refreshResult = await refreshJQuantsIdTokenLogic(refreshToken);
      if (refreshResult && refreshResult.newIdToken) {
        onIdTokenRefreshed(
          refreshResult.newIdToken,
          refreshResult.newRefreshToken
        );
        console.log("Retrying fetchOHLC with new ID token...");
        // Retry the fetch with the new token
        // Important: Pass the NEW idToken here
        const refreshedData = await fetchFromAPI(
          refreshResult.newIdToken,
          code,
          start,
          end
        );
        if (refreshedData)
          await db
            .put(STORE, refreshedData, cacheKey)
            .catch((e) => console.warn("DB write error:", e));
        return refreshedData;
      } else {
        console.error("Token refresh failed. Cannot fetch data.");
        throw new Error(
          "J-Quants token refresh failed. Please check refresh token and try again."
        );
      }
    } else {
      console.error("Unhandled error in fetchOHLC:", error);
      throw error; // Re-throw other errors
    }
  }
}

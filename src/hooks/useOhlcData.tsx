import { useState, useCallback } from "react";
import {
  tableToIPC,
  Float64,
  DateDay,
  Int32,
  Table,
  makeVector,
  Vector,
} from "apache-arrow";
import { fetchOHLC } from "../lib/fetchJQuants";
import { OHLCFrameJSON } from "../lib/types";
import { useApiKeys } from "./useApiKeys";

// APIからのデータ型やエラー型は実際の仕様に合わせて定義してください
interface OhlcData {
  date: string; // YYYY-MM-DD 形式を想定
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface UseOhlcDataReturn {
  ohlcData: OhlcData[] | null;
  isLoading: boolean;
  error: Error | null;
  triggerRefetch: (
    codes: string[],
    startDate: string,
    endDate: string
  ) => Promise<ArrayBuffer | null>;
}

export const useOhlcData = (): UseOhlcDataReturn => {
  const [ohlcData, setOhlcData] = useState<OhlcData[] | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);
  const { keys, updateKeys } = useApiKeys();

  const triggerRefetch = useCallback(
    async (
      codes: string[],
      startDate: string,
      endDate: string
    ): Promise<ArrayBuffer | null> => {
      setIsLoading(true);
      setError(null);
      console.log(
        "Fetching OHLC data for:",
        codes,
        "from",
        startDate,
        "to",
        endDate
      );

      try {
        // Check if we have the necessary API keys
        if (!keys.jquants_refresh) {
          throw new Error(
            "J-Quants Refresh Token is not configured. Please set up API keys first."
          );
        }

        if (!keys.jquants_id) {
          throw new Error(
            "J-Quants ID Token is not available. Please check your API configuration."
          );
        }

        // Fetch data for the first code (for now, handle multiple codes later)
        const primaryCode = codes[0];
        if (!primaryCode) {
          throw new Error("At least one stock code must be provided.");
        }

        console.log(
          `Fetching data for ${primaryCode} from ${startDate} to ${endDate}`
        );

        const ohlcFrame = await fetchOHLC(
          keys.jquants_id,
          keys.jquants_refresh,
          (newIdToken: string, newRefreshToken?: string) => {
            // Update tokens when refreshed
            updateKeys({
              jquants_id: newIdToken,
              ...(newRefreshToken && { jquants_refresh: newRefreshToken }),
            });
          },
          primaryCode,
          startDate,
          endDate
        );

        if (!ohlcFrame) {
          throw new Error(`No data returned for ${primaryCode}`);
        }

        // Convert OHLCFrameJSON to OhlcData[]
        const rawData: OhlcData[] = [];
        for (let i = 0; i < ohlcFrame.index.length; i++) {
          const dateStr = ohlcFrame.index[i];
          const rowData = ohlcFrame.data[i];

          if (rowData && rowData.length >= 5) {
            rawData.push({
              date: dateStr,
              open: rowData[0] || 0,
              high: rowData[1] || 0,
              low: rowData[2] || 0,
              close: rowData[3] || 0,
              volume: rowData[4] || 0,
            });
          }
        }

        console.log(
          `Successfully fetched ${rawData.length} data points for ${primaryCode}`
        );
        setOhlcData(rawData);

        // Convert to Arrow table for backtesting
        const dateValues = rawData.map((d) => Date.parse(d.date));
        const openValues = rawData.map((d) => d.open);
        const highValues = rawData.map((d) => d.high);
        const lowValues = rawData.map((d) => d.low);
        const closeValues = rawData.map((d) => d.close);
        const volumeValues = rawData.map((d) => d.volume);

        const arrowTable = new Table({
          date: makeVector({ data: dateValues, type: new DateDay() }),
          open: makeVector({ data: openValues, type: new Float64() }),
          high: makeVector({ data: highValues, type: new Float64() }),
          low: makeVector({ data: lowValues, type: new Float64() }),
          close: makeVector({ data: closeValues, type: new Float64() }),
          volume: makeVector({ data: volumeValues, type: new Int32() }),
        });

        const arrowIPC = tableToIPC(arrowTable, "file");

        setIsLoading(false);
        // Ensure a plain ArrayBuffer is returned
        const newBuffer = new ArrayBuffer(arrowIPC.byteLength);
        new Uint8Array(newBuffer).set(arrowIPC);
        return newBuffer;
      } catch (e) {
        console.error("Failed to fetch or process OHLC data:", e);
        setError(e as Error);
        setOhlcData(null);
        setIsLoading(false);
        return null;
      }
    },
    [keys, updateKeys]
  );

  return { ohlcData, isLoading, error, triggerRefetch };
};

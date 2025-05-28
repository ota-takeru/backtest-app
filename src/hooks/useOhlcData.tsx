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
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const rawData: OhlcData[] = [
          {
            date: "2023-01-01",
            open: 100,
            high: 105,
            low: 98,
            close: 102,
            volume: 10000,
          },
          {
            date: "2023-01-02",
            open: 102,
            high: 108,
            low: 100,
            close: 105,
            volume: 12000,
          },
          {
            date: "2023-01-03",
            open: 105,
            high: 106,
            low: 101,
            close: 103,
            volume: 11000,
          },
        ];
        setOhlcData(rawData);

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
    []
  );

  return { ohlcData, isLoading, error, triggerRefetch };
};

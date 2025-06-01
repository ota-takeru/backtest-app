import { useCallback } from "react";
import { v4 as uuidv4 } from "uuid";
import {
  Table,
  tableToIPC,
  makeVector,
  DateDay,
  Float64,
  Int32,
} from "apache-arrow";
import { BacktestRequest, StrategyAST } from "../types";
import { OHLCFrameJSON } from "../lib/types";

interface UseBacktestExecutionProps {
  onProgress: (value: number, message: string) => void;
  onError: (error: string) => void;
  runBacktest: (
    request: BacktestRequest,
    transferableBuffer: ArrayBuffer
  ) => void;
}

export function useBacktestExecution({
  onProgress,
  onError,
  runBacktest,
}: UseBacktestExecutionProps) {
  const convertOhlcToArrow = useCallback(
    async (ohlcFrame: OHLCFrameJSON): Promise<ArrayBuffer> => {
      // Yield control to UI before starting conversion
      await new Promise((resolve) => setTimeout(resolve, 0));

      const dateTimestamps = ohlcFrame.index.map((dateStr: string) =>
        new Date(dateStr).getTime()
      );

      // Yield control during array creation for large datasets
      await new Promise((resolve) => setTimeout(resolve, 0));

      const opens = Float64Array.from(
        ohlcFrame.data.map((row: any) => row[0] ?? NaN)
      );
      const highs = Float64Array.from(
        ohlcFrame.data.map((row: any) => row[1] ?? NaN)
      );
      const lows = Float64Array.from(
        ohlcFrame.data.map((row: any) => row[2] ?? NaN)
      );
      const closes = Float64Array.from(
        ohlcFrame.data.map((row: any) => row[3] ?? NaN)
      );
      const volumes = Int32Array.from(
        ohlcFrame.data.map((row: any) => row[4] ?? 0)
      );

      // Yield control before table creation
      await new Promise((resolve) => setTimeout(resolve, 0));

      const table = new Table({
        date: makeVector({ data: dateTimestamps, type: new DateDay() }),
        open: makeVector({ data: opens, type: new Float64() }),
        high: makeVector({ data: highs, type: new Float64() }),
        low: makeVector({ data: lows, type: new Float64() }),
        close: makeVector({ data: closes, type: new Float64() }),
        volume: makeVector({ data: volumes, type: new Int32() }),
      });

      const arrowUint8Array = tableToIPC(table, "file");
      return new Uint8Array(arrowUint8Array).buffer;
    },
    []
  );

  const executeBacktest = useCallback(
    async (dsl: StrategyAST, ohlcData: Record<string, OHLCFrameJSON>) => {
      onProgress(75, "バックテスト準備中 (Arrowデータ変換開始)...");

      const targetCode = dsl.universe[0];
      const ohlcFrame = ohlcData[targetCode];

      if (!ohlcFrame) {
        onError(`銘柄 ${targetCode} のOHLCデータが見つかりません。`);
        onProgress(100, "データエラー");
        return;
      }

      let arrowBuffer: ArrayBuffer;
      try {
        arrowBuffer = await convertOhlcToArrow(ohlcFrame);
        onProgress(85, "Arrowデータ変換完了。バックテスト実行中...");
      } catch (e: any) {
        onError(
          `E0009: OHLCデータのArrow IPC形式への変換に失敗しました: ${e.message}`
        );
        onProgress(100, "データ変換エラー");
        return;
      }

      const req_id = uuidv4();
      const request: BacktestRequest = {
        req_id,
        dsl_ast: dsl,
        arrow: new Uint8Array(arrowBuffer),
        params: {
          initCash: dsl.cash || 1000000,
          slippageBp: dsl.slippage_bp || 3,
        },
      };

      runBacktest(request, arrowBuffer);
    },
    [convertOhlcToArrow, onProgress, onError, runBacktest]
  );

  return {
    executeBacktest,
  };
}

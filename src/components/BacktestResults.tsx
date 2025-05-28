import { useEffect, useState } from "react";
import {
  StrategyDSL,
  BacktestRequest,
  WorkerMessage,
  OHLCFrameJSON,
  BacktestResponse,
} from "../lib/types";
import { v4 as uuidv4 } from "uuid";
import {
  Table,
  tableToIPC,
  makeVector,
  DateDay,
  Float64,
  Int32,
} from "apache-arrow";

interface Props {
  dsl: StrategyDSL;
  codes: string[];
  startDate: string;
  endDate: string;
  apiKey: string;
  ohlcDataProp: Record<string, OHLCFrameJSON>;
  onProgressUpdate: (progress: number, message: string) => void;
}

export function BacktestResults({
  dsl,
  codes,
  startDate,
  endDate,
  apiKey,
  ohlcDataProp,
  onProgressUpdate,
}: Props) {
  const [metrics, setMetrics] = useState<BacktestResponse["metrics"] | null>(
    null
  );
  const [equityCurve, setEquityCurve] = useState<
    Array<{ date: string; equity: number }>
  >([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showDsl, setShowDsl] = useState(false);

  useEffect(() => {
    if (!dsl || !dsl.universe || dsl.universe.length === 0) {
      setError("戦略に銘柄が指定されていません。");
      setIsLoading(false);
      onProgressUpdate(0, "");
      return;
    }
    if (Object.keys(ohlcDataProp).length === 0) {
      setError("OHLCデータが提供されていません。");
      setIsLoading(false);
      onProgressUpdate(0, "");
      return;
    }

    const targetCode = dsl.universe[0];
    const ohlcFrame = ohlcDataProp[targetCode];

    if (!ohlcFrame) {
      setError(`銘柄 ${targetCode} のOHLCデータが見つかりません。`);
      setIsLoading(false);
      onProgressUpdate(0, "");
      return;
    }

    setIsLoading(true);
    setError(null);
    setMetrics(null);
    setEquityCurve([]);
    onProgressUpdate(55, "バックテスト準備中 (Arrowデータ変換開始)...");

    const req_id = uuidv4();
    const worker = new Worker(new URL("../worker/worker.ts", import.meta.url), {
      type: "module",
    });

    let arrow: Uint8Array;
    try {
      const dateTimestamps = ohlcFrame.index.map((dateStr) =>
        new Date(dateStr).getTime()
      );
      const opens = Float64Array.from(
        ohlcFrame.data.map((row) => row[0] ?? NaN)
      );
      const highs = Float64Array.from(
        ohlcFrame.data.map((row) => row[1] ?? NaN)
      );
      const lows = Float64Array.from(
        ohlcFrame.data.map((row) => row[2] ?? NaN)
      );
      const closes = Float64Array.from(
        ohlcFrame.data.map((row) => row[3] ?? NaN)
      );
      const volumes = Int32Array.from(ohlcFrame.data.map((row) => row[4] ?? 0));

      const table = new Table({
        date: makeVector({ data: dateTimestamps, type: new DateDay() }),
        open: makeVector({ data: opens, type: new Float64() }),
        high: makeVector({ data: highs, type: new Float64() }),
        low: makeVector({ data: lows, type: new Float64() }),
        close: makeVector({ data: closes, type: new Float64() }),
        volume: makeVector({ data: volumes, type: new Int32() }),
      });
      arrow = tableToIPC(table, "file");
      onProgressUpdate(65, "Arrowデータ変換完了。バックテスト実行中...");
    } catch (e: any) {
      setError(`OHLCデータのArrow変換エラー: ${e.message}`);
      setIsLoading(false);
      onProgressUpdate(100, "データ変換エラー");
      worker.terminate();
      return;
    }

    const tempTableName = `ohlc_${req_id.replace(/-/g, "")}`;
    const sql = `SELECT date, close AS equity FROM ${tempTableName} ORDER BY date;`;
    const params = {
      initCash: dsl.cash || 1000000,
      slippageBp: dsl.slippage_bp || 3,
    };

    const request: BacktestRequest = { req_id, sql, arrow, params };
    worker.postMessage(request, [arrow.buffer]);

    worker.onmessage = (ev) => {
      const res = ev.data as WorkerMessage;
      if (res.req_id !== req_id) return;
      if (res.type === "progress") {
        onProgressUpdate(res.progress!, res.message!);
      } else if (res.type === "result") {
        if (res.warnings) setError(res.warnings.join("\n"));
        setEquityCurve(res.equityCurve!);
        setMetrics(res.metrics!);
        setIsLoading(false);
        onProgressUpdate(100, "バックテスト完了");
        worker.terminate();
      } else if (res.type === "error") {
        setError(`バックテスト実行エラー: ${res.message}`);
        setIsLoading(false);
        onProgressUpdate(100, "バックテストエラー");
        worker.terminate();
      }
    };

    worker.onerror = (err) => {
      setError(`Worker初期化エラーまたは予期せぬエラー: ${err.message}`);
      setIsLoading(false);
      onProgressUpdate(100, "Workerエラー");
      worker.terminate();
    };

    return () => worker.terminate();
  }, [dsl, ohlcDataProp, onProgressUpdate]);

  if (isLoading) return <p>バックテスト実行中... (プログレスバーで詳細確認)</p>;
  if (error && !metrics) return <p className="text-red-600">エラー: {error}</p>;

  return <div className="space-y-4">{/* メトリクス表示など */}</div>;
}

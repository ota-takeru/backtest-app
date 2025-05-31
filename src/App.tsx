import { useState, useEffect, useCallback } from "react";
// import { ApiKeyForm } from "./components/ApiKeyForm"; // No longer used directly
import { ApiKeyModal } from "./components/ApiKeyModal";
import { useApiKeys, ApiKeys } from "./hooks/useApiKeys";
import { StrategyEditor } from "./components/StrategyEditor";
import { BacktestResults } from "./components/BacktestResults";
import { StockPeriodSelector } from "./components/StockPeriodSelector";
import { ProgressBar } from "./components/ProgressBar";
import { StrategyDSL, OHLCFrameJSON } from "./lib/types";
import { fetchOHLC, refreshJQuantsIdTokenLogic } from "./lib/fetchJQuants";
import {
  BacktestRequest,
  BacktestResponse,
  WorkerMessage,
  TradeRow,
  StrategyAST,
} from "./types";
import { v4 as uuidv4 } from "uuid";
import {
  Table,
  tableToIPC,
  makeVector,
  DateDay,
  Float64,
  Int32,
} from "apache-arrow";

interface DataConfig {
  codes: string[];
  startDate: string;
  endDate: string;
}

interface BacktestRunConfig {
  dsl: StrategyAST;
  codes: string[];
  startDate: string;
  endDate: string;
}

// Helper function to convert OHLC data to Arrow IPC format
async function convertOhlcToArrow(
  data: Record<string, OHLCFrameJSON>
): Promise<Uint8Array> {
  // Take the first stock's data (since we're handling single stock for now)
  const firstCode = Object.keys(data)[0];
  if (!firstCode || !data[firstCode]) {
    throw new Error("No OHLC data provided");
  }

  const ohlcData = data[firstCode];

  // Convert to Arrow Table
  const dates = ohlcData.date.map((d) => new Date(d));
  const opens = ohlcData.open;
  const highs = ohlcData.high;
  const lows = ohlcData.low;
  const closes = ohlcData.close;
  const volumes = ohlcData.volume;

  // Create Arrow vectors
  const dateVector = makeVector({
    type: new DateDay(),
    data: dates.map((d) => Math.floor(d.getTime() / (24 * 60 * 60 * 1000))), // Convert to days since epoch
  });

  const openVector = makeVector({
    type: new Float64(),
    data: opens,
  });

  const highVector = makeVector({
    type: new Float64(),
    data: highs,
  });

  const lowVector = makeVector({
    type: new Float64(),
    data: lows,
  });

  const closeVector = makeVector({
    type: new Float64(),
    data: closes,
  });

  const volumeVector = makeVector({
    type: new Int32(),
    data: volumes,
  });

  // Create Arrow table
  const table = new Table({
    date: dateVector,
    open: openVector,
    high: highVector,
    low: lowVector,
    close: closeVector,
    volume: volumeVector,
  });

  // Convert to IPC format
  return tableToIPC(table);
}

export default function App() {
  const { keys: apiKeys, updateKeys } = useApiKeys();
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);

  const [progress, setProgress] = useState<{ value: number; message: string }>({
    value: 0,
    message: "",
  });
  const [dataConfig, setDataConfig] = useState<DataConfig | null>(null);
  const [validatedDsl, setValidatedDsl] = useState<StrategyAST | null>(null);
  const [runConfig, setRunConfig] = useState<BacktestRunConfig | null>(null);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [isBacktestLoading, setIsBacktestLoading] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [ohlcData, setOhlcData] = useState<Record<string, OHLCFrameJSON>>({});
  const [showDsl, setShowDsl] = useState(false);
  const [worker, setWorker] = useState<Worker | null>(null);
  const [backtestResult, setBacktestResult] = useState<BacktestResponse | null>(
    null
  );
  const [backtestError, setBacktestError] = useState<string | null>(null);

  // Open modal if JQuants key is not set on initial load
  useEffect(() => {
    if (!apiKeys.jquants_refresh) {
      setIsApiKeyModalOpen(true);
    }
  }, [apiKeys.jquants_refresh]);

  const handleJQuantsTokenRefreshed = useCallback(
    (newIdToken: string, newRefreshToken?: string) => {
      const updates: Partial<ApiKeys> = { jquants_id: newIdToken };
      if (newRefreshToken) {
        updates.jquants_refresh = newRefreshToken;
      }
      updateKeys(updates);
      console.log("App: J-Quants tokens updated in state and session storage.");
    },
    [updateKeys]
  );

  const handleProgressUpdate = useCallback((value: number, message: string) => {
    setProgress({ value, message });
  }, []);

  const handleDataConfigSubmit = useCallback(
    async (codes: string[], startDate: string, endDate: string) => {
      if (!apiKeys.jquants_refresh) {
        // E0001: J-Quants APIキー (Refresh Token) 未設定
        setDataError(
          "E2001: J-Quants Refresh Tokenが設定されていません。設定画面を開いてください。"
        );
        setIsApiKeyModalOpen(true);
        setProgress({ value: 0, message: "APIキー未設定" }); // プログレスもリセット
        return;
      }

      // Attempt to get ID token, refresh if necessary and missing
      let currentIdToken = apiKeys.jquants_id;
      if (!currentIdToken) {
        setProgress({
          value: 1,
          message: "IDトークン取得中... (初回リフレッシュ)",
        });
        const refreshResult = await refreshJQuantsIdTokenLogic(
          apiKeys.jquants_refresh
        );
        if (refreshResult && refreshResult.newIdToken) {
          handleJQuantsTokenRefreshed(
            refreshResult.newIdToken,
            refreshResult.newRefreshToken
          );
          currentIdToken = refreshResult.newIdToken;
        } else {
          // E0002: J-Quants API IDトークン取得失敗
          setDataError(
            "E2002: J-Quants IDトークンの取得/更新に失敗しました。Refresh Tokenを確認してください。"
          );
          setProgress({ value: 100, message: "IDトークン取得失敗" });
          setIsApiKeyModalOpen(true);
          return;
        }
      }

      setDataConfig({ codes, startDate, endDate });
      setIsLoadingData(true);
      setDataError(null);
      setOhlcData({});
      setBacktestResult(null);
      setBacktestError(null);
      setProgress({
        value: 5,
        message: "データ取得設定完了。OHLCデータ取得開始...",
      });

      try {
        const ohlcPromises = codes.map((code, index) =>
          fetchOHLC(
            currentIdToken!,
            apiKeys.jquants_refresh,
            handleJQuantsTokenRefreshed,
            code,
            startDate,
            endDate
          ).then((frame) => {
            handleProgressUpdate(
              5 + ((index + 1) / codes.length) * 45,
              `OHLCデータ取得中: ${code} (${index + 1}/${codes.length})`
            );
            return frame;
          })
        );
        const results = await Promise.all(ohlcPromises);
        handleProgressUpdate(50, "全OHLCデータ取得完了。処理中...");

        const newOhlcData: Record<string, OHLCFrameJSON> = {};
        let successfulFetches = 0;
        results.forEach((result, index) => {
          if (result) {
            newOhlcData[codes[index]] = result;
            successfulFetches++;
          }
        });

        if (successfulFetches === 0) {
          // E0003: J-Quants APIデータ取得失敗 (全件失敗)
          setDataError(
            "E2003: 指定された全ての銘柄・期間のOHLCデータを取得できませんでした。APIキー、銘柄コード、期間を確認してください。"
          );
          handleProgressUpdate(100, "データ取得失敗");
          setIsLoadingData(false);
          return;
        } else if (successfulFetches < codes.length) {
          // E0003: 部分的なデータ取得失敗 (警告に近いが、エラーとしても表示)
          setDataError(
            `E2003: 一部の銘柄のOHLCデータ取得に失敗しました。取得成功: ${successfulFetches}/${codes.length}. 詳細はコンソールを確認してください。`
          );
          // データ取得は継続するがエラーメッセージは表示
        }

        setOhlcData(newOhlcData);
        handleProgressUpdate(55, "データ取得・処理完了。戦略定義待機中...");

        if (validatedDsl) {
          setRunConfig({
            dsl: validatedDsl,
            codes: Object.keys(newOhlcData),
            startDate,
            endDate,
          });
        }
      } catch (error: any) {
        console.error("Data fetching process error:", error);
        // E0003: その他のデータ取得プロセスエラー
        setDataError(
          `E2003: OHLCデータ取得プロセス中にエラーが発生しました: ${
            error.message || String(error)
          }`
        );
        handleProgressUpdate(100, "データ取得中にエラー発生");
      } finally {
        setIsLoadingData(false);
      }
    },
    [apiKeys, handleJQuantsTokenRefreshed, validatedDsl, handleProgressUpdate]
  );

  const handleStrategyValidated = useCallback(
    (dsl: StrategyAST) => {
      setValidatedDsl(dsl);
      setShowDsl(true);
      setBacktestResult(null);
      setBacktestError(null);
      handleProgressUpdate(60, "戦略検証完了。バックテスト準備中...");

      if (dataConfig && Object.keys(ohlcData).length > 0) {
        setRunConfig({
          dsl,
          codes: Object.keys(ohlcData),
          startDate: dataConfig.startDate,
          endDate: dataConfig.endDate,
        });
      }
    },
    [dataConfig, ohlcData, handleProgressUpdate]
  );

  // Initialize worker
  useEffect(() => {
    const newWorker = new Worker(
      new URL("./worker/worker.ts", import.meta.url),
      { type: "module" }
    );
    setWorker(newWorker);

    newWorker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      const data = event.data;

      if (data.type === "progress") {
        setProgress({ value: data.progress ?? 0, message: data.message ?? "" });
      } else if (data.type === "result") {
        setBacktestResult(data);
        setBacktestError(null);
        setIsBacktestLoading(false);
        setProgress({ value: 100, message: "バックテスト完了" });
      } else if (data.type === "error") {
        setBacktestError(data.message);
        setBacktestResult(null);
        setIsBacktestLoading(false);
        setProgress({ value: 100, message: `エラー: ${data.message}` });
      }
    };

    newWorker.onerror = (errorEvent) => {
      console.error("Worker error:", errorEvent);
      // E0008: Worker初期化失敗
      setBacktestError(
        `E0008: Workerとの通信確立または初期化に失敗しました: ${errorEvent.message}`
      );
      setBacktestResult(null);
      setIsBacktestLoading(false);
      setProgress({
        value: 100,
        message: "Workerで致命的なエラーが発生しました。",
      });
    };

    return () => {
      newWorker.terminate();
      setWorker(null);
    };
  }, []);

  // Effect to run backtest when runConfig changes
  useEffect(() => {
    if (!runConfig || !worker || Object.keys(ohlcData).length === 0) {
      if (
        isBacktestLoading &&
        (!runConfig || Object.keys(ohlcData).length === 0)
      ) {
        setIsBacktestLoading(false);
        if (!runConfig)
          setProgress((prev) => ({
            ...prev,
            message: "戦略が定義されていません。",
          }));
        if (Object.keys(ohlcData).length === 0)
          setProgress((prev) => ({
            ...prev,
            message: "OHLCデータがありません。",
          }));
      }
      return;
    }

    setIsBacktestLoading(true);
    setBacktestResult(null);
    setBacktestError(null);
    handleProgressUpdate(75, "バックテスト準備中 (Arrowデータ変換開始)...");

    const targetCode = runConfig.dsl.universe[0];
    const ohlcFrame = ohlcData[targetCode];

    if (!ohlcFrame) {
      setBacktestError(`銘柄 ${targetCode} のOHLCデータが見つかりません。`);
      setIsBacktestLoading(false);
      handleProgressUpdate(100, "データエラー");
      return;
    }

    let arrowBuffer: ArrayBuffer;
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
      const arrowUint8Array = tableToIPC(table, "file");
      arrowBuffer = new Uint8Array(arrowUint8Array).buffer;
      handleProgressUpdate(85, "Arrowデータ変換完了。バックテスト実行中...");
    } catch (e: any) {
      // E0009: OHLCデータ → Arrow変換失敗
      setBacktestError(
        `E0009: OHLCデータのArrow IPC形式への変換に失敗しました: ${e.message}`
      );
      setIsBacktestLoading(false);
      handleProgressUpdate(100, "データ変換エラー");
      return;
    }

    const req_id = uuidv4();
    const request: BacktestRequest = {
      req_id,
      dsl_ast: runConfig.dsl,
      arrow: new Uint8Array(arrowBuffer),
      params: {
        initCash: runConfig.dsl.cash || 1000000,
        slippageBp: runConfig.dsl.slippage_bp || 3,
      },
    };

    console.log("[App] Sending backtest request:", {
      req_id,
      dsl_ast: runConfig.dsl,
      arrow_length: new Uint8Array(arrowBuffer).length,
      params: request.params,
    });

    worker.postMessage(request, [arrowBuffer]);
  }, [runConfig, worker, ohlcData, handleProgressUpdate]);

  return (
    <div className="container mx-auto p-4 space-y-6">
      <ProgressBar progress={progress.value} message={progress.message} />

      <header className="flex justify-between items-center py-2 border-b mb-4">
        <h1 className="text-2xl font-bold">
          日本株クライアントサイド・バックテスト
        </h1>
        <button
          onClick={() => setIsApiKeyModalOpen(true)}
          className="px-3 py-2 border rounded text-sm hover:bg-gray-100"
        >
          APIキー設定
        </button>
      </header>

      <ApiKeyModal
        isOpen={isApiKeyModalOpen}
        onClose={() => setIsApiKeyModalOpen(false)}
      />

      {!apiKeys.jquants_refresh && !isApiKeyModalOpen && (
        <div className="p-4 bg-yellow-100 text-yellow-800 rounded">
          J-Quants Refresh
          Tokenが設定されていません。右上の「APIキー設定」からキーを登録してください。
        </div>
      )}

      {apiKeys.jquants_refresh && (
        <>
          <section className="space-y-4">
            <h2 className="text-xl font-semibold">1. 銘柄・期間の選択</h2>
            {!dataConfig ? (
              <StockPeriodSelector onSubmit={handleDataConfigSubmit} />
            ) : (
              <div className="bg-gray-50 p-4 rounded">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-medium">選択済み:</p>
                    <p>銘柄: {dataConfig.codes.join(", ")}</p>
                    <p>
                      期間: {dataConfig.startDate} 〜 {dataConfig.endDate}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setDataConfig(null);
                      setOhlcData({});
                      setRunConfig(null);
                      setValidatedDsl(null);
                      setProgress({ value: 0, message: "" });
                    }}
                    className="text-blue-600 hover:text-blue-800"
                  >
                    変更
                  </button>
                </div>
                {isLoadingData && (
                  <p className="mt-2">
                    データ取得中...{" "}
                    {progress.message.includes("OHLCデータ取得中")
                      ? progress.message.split(": ")[1]
                      : ""}
                  </p>
                )}
                {dataError && (
                  <p className="mt-2 text-red-600">エラー: {dataError}</p>
                )}
                {!isLoadingData &&
                  !dataError &&
                  Object.keys(ohlcData).length > 0 && (
                    <p className="mt-2 text-green-600">
                      ✓ データ取得完了 ({Object.keys(ohlcData).length}/
                      {dataConfig?.codes?.length || 0}銘柄)
                      {Object.keys(ohlcData).length <
                        (dataConfig?.codes?.length || 0) && (
                        <span className="text-yellow-600 ml-2">
                          一部銘柄の取得に失敗
                        </span>
                      )}
                    </p>
                  )}
              </div>
            )}
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold">2. 戦略の定義</h2>
            <StrategyEditor
              onStrategySubmit={handleStrategyValidated}
              apiKeys={apiKeys}
            />
            {showDsl && validatedDsl && (
              <div className="mt-4 p-3 bg-gray-100 rounded">
                <h3 className="font-semibold">検証済みDSL:</h3>
                <pre className="text-sm whitespace-pre-wrap">
                  {JSON.stringify(validatedDsl, null, 2)}
                </pre>
              </div>
            )}
          </section>

          {(isBacktestLoading || backtestResult || backtestError) &&
            runConfig && (
              <section className="space-y-4">
                <h2 className="text-xl font-semibold">3. バックテスト結果</h2>
                {backtestResult && (
                  <BacktestResults
                    dsl={runConfig.dsl}
                    codes={runConfig.codes}
                    startDate={runConfig.startDate}
                    endDate={runConfig.endDate}
                    apiKey={apiKeys.openai || ""}
                    ohlcDataProp={ohlcData}
                    onProgressUpdate={handleProgressUpdate}
                    backtestResponse={backtestResult}
                    isLoading={isBacktestLoading}
                    error={backtestError}
                  />
                )}
                {backtestError && (
                  <div className="p-4 bg-red-100 text-red-700 rounded">
                    <p className="font-bold">エラー:</p>
                    <p>{backtestError}</p>
                  </div>
                )}
              </section>
            )}
        </>
      )}
    </div>
  );
}

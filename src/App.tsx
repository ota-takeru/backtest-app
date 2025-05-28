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

interface DataConfig {
  codes: string[];
  startDate: string;
  endDate: string;
}

interface BacktestRunConfig {
  dsl: StrategyDSL;
  codes: string[];
  startDate: string;
  endDate: string;
}

export default function App() {
  const { keys: apiKeys, updateKeys } = useApiKeys();
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);

  const [progress, setProgress] = useState<{ value: number; message: string }>({
    value: 0,
    message: "",
  });
  const [dataConfig, setDataConfig] = useState<DataConfig | null>(null);
  const [validatedDsl, setValidatedDsl] = useState<StrategyDSL | null>(null);
  const [runConfig, setRunConfig] = useState<BacktestRunConfig | null>(null);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [ohlcData, setOhlcData] = useState<Record<string, OHLCFrameJSON>>({});
  const [showDsl, setShowDsl] = useState(false);

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
        alert(
          "J-Quants Refresh Tokenが設定されていません。設定画面を開いてください。"
        );
        setIsApiKeyModalOpen(true);
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
          setDataError(
            "J-Quants IDトークンの取得に失敗しました。Refresh Tokenを確認してください。"
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
          setDataError(
            "指定された全ての銘柄・期間のデータを取得できませんでした。APIキーや銘柄コード、期間を確認してください。"
          );
          handleProgressUpdate(100, "データ取得失敗");
          setIsLoadingData(false);
          return;
        } else if (successfulFetches < codes.length) {
          setDataError(
            `一部の銘柄のデータ取得に失敗しました。取得成功: ${successfulFetches}/${codes.length}`
          );
          // Continue with successfully fetched data
        }

        setOhlcData(newOhlcData);
        handleProgressUpdate(55, "データ取得・処理完了。戦略定義待機中...");

        if (validatedDsl) {
          handleProgressUpdate(70, "戦略定義済み。バックテスト開始...");
          setRunConfig({
            dsl: validatedDsl,
            codes: Object.keys(newOhlcData), // Use only codes for which data was fetched
            startDate,
            endDate,
          });
        }
      } catch (error: any) {
        console.error("Data fetching process error:", error);
        setDataError(
          `データ取得プロセスエラー: ${error.message || String(error)}`
        );
        handleProgressUpdate(100, "データ取得中にエラー発生");
      } finally {
        setIsLoadingData(false);
      }
    },
    [apiKeys, handleJQuantsTokenRefreshed, validatedDsl, handleProgressUpdate]
  );

  const handleStrategyValidated = useCallback(
    (dsl: StrategyDSL) => {
      setValidatedDsl(dsl);
      setShowDsl(true); // Show DSL upon validation
      handleProgressUpdate(60, "戦略検証完了。バックテスト準備中...");

      if (dataConfig && Object.keys(ohlcData).length > 0) {
        handleProgressUpdate(70, "データ取得済み。バックテスト開始...");
        setRunConfig({
          dsl,
          codes: Object.keys(ohlcData), // Ensure we use codes for which data exists
          startDate: dataConfig.startDate,
          endDate: dataConfig.endDate,
        });
      }
    },
    [dataConfig, ohlcData, handleProgressUpdate]
  );

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
                      setValidatedDsl(null); // Reset strategy as well
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
              onValidated={handleStrategyValidated}
              selectedStockCodes={dataConfig ? dataConfig.codes : []}
            />
            {validatedDsl && (
              <div className="mt-4">
                <button
                  onClick={() => setShowDsl(!showDsl)}
                  className="text-blue-600 hover:text-blue-700 mb-2"
                >
                  {showDsl ? "▼" : "▶"} 検証済み戦略DSLを表示
                </button>
                {showDsl && (
                  <pre className="bg-gray-100 p-3 rounded text-sm overflow-x-auto">
                    {JSON.stringify(validatedDsl, null, 2)}
                  </pre>
                )}
              </div>
            )}
            {validatedDsl &&
              !runConfig &&
              Object.keys(ohlcData).length === 0 &&
              dataConfig && (
                <p className="text-blue-600">
                  ✓ 戦略の検証完了。データ取得完了後にバックテストを開始します。
                </p>
              )}
          </section>

          {runConfig && Object.keys(ohlcData).length > 0 && (
            <section className="space-y-4">
              <h2 className="text-xl font-semibold">3. バックテスト結果</h2>
              <BacktestResults
                key={`${runConfig.codes.join("-")}-${runConfig.startDate}-${
                  runConfig.endDate
                }`}
                dsl={runConfig.dsl}
                codes={runConfig.codes}
                startDate={runConfig.startDate}
                endDate={runConfig.endDate}
                apiKey={apiKeys.jquants_id}
                ohlcDataProp={ohlcData}
                onProgressUpdate={handleProgressUpdate}
              />
            </section>
          )}
        </>
      )}
    </div>
  );
}

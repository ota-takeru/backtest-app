import { useEffect, useCallback } from "react";
import { ApiKeyModal } from "./components/ApiKeyModal";
import { useApiKeys, ApiKeys } from "./hooks/useApiKeys";
import { StrategyEditor } from "./components/StrategyEditor";
import { BacktestResults } from "./components/BacktestResults";
import { StockPeriodSelector } from "./components/StockPeriodSelector";
import { ProgressBar } from "./components/ProgressBar";
import { StrategyAST } from "./types";

// Custom hooks
import { useAppState } from "./hooks/useAppState";
import { useDataFetching } from "./hooks/useDataFetching";
import { useBacktestWorker } from "./hooks/useBacktestWorker";
import { useBacktestExecution } from "./hooks/useBacktestExecution";

export default function App() {
  const { keys: apiKeys, updateKeys } = useApiKeys();

  // Use centralized state management
  const { state, actions } = useAppState();

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

  // Data fetching hook
  const { fetchData } = useDataFetching({
    apiKeys,
    onTokenRefreshed: handleJQuantsTokenRefreshed,
    onProgressUpdate: (value, message) =>
      actions.setProgress({ value, message }),
    onDataError: actions.setDataError,
    onDataSuccess: actions.setOhlcData,
    onLoadingChange: actions.setLoadingData,
    validatedDsl: state.validatedDsl,
  });

  // Backtest worker hook
  const { runBacktest } = useBacktestWorker({
    onProgress: (value, message) => actions.setProgress({ value, message }),
    onResult: actions.setBacktestResult,
    onError: actions.setBacktestError,
    onLoadingChange: actions.setBacktestLoading,
  });

  // Backtest execution hook
  const { executeBacktest } = useBacktestExecution({
    onProgress: (value, message) => actions.setProgress({ value, message }),
    onError: actions.setBacktestError,
    runBacktest,
  });

  // Open modal if JQuants key is not set on initial load
  useEffect(() => {
    if (!apiKeys.jquants_refresh) {
      actions.setApiKeyModalOpen(true);
    }
  }, [apiKeys.jquants_refresh, actions]);

  const handleDataConfigSubmit = useCallback(
    async (codes: string[], startDate: string, endDate: string) => {
      if (!apiKeys.jquants_refresh) {
        actions.setDataError(
          "E2001: J-Quants Refresh Tokenが設定されていません。設定画面を開いてください。"
        );
        actions.setApiKeyModalOpen(true);
        actions.setProgress({ value: 0, message: "APIキー未設定" });
        return;
      }

      actions.setDataConfig({ codes, startDate, endDate });

      const success = await fetchData(codes, startDate, endDate);

      // If data fetching was successful and we have a validated DSL, set up run config
      if (success && state.validatedDsl) {
        actions.setRunConfig({
          dsl: state.validatedDsl,
          codes: Object.keys(state.ohlcData),
          startDate,
          endDate,
        });
      }
    },
    [apiKeys, fetchData, state.validatedDsl, state.ohlcData, actions]
  );

  const handleStrategyValidated = useCallback(
    (dsl: StrategyAST) => {
      actions.setValidatedDsl(dsl);
      actions.setShowDsl(true);
      actions.resetBacktest();
      actions.setProgress({
        value: 60,
        message: "戦略検証完了。バックテスト準備中...",
      });

      if (state.dataConfig && Object.keys(state.ohlcData).length > 0) {
        actions.setRunConfig({
          dsl,
          codes: Object.keys(state.ohlcData),
          startDate: state.dataConfig.startDate,
          endDate: state.dataConfig.endDate,
        });
      }
    },
    [state.dataConfig, state.ohlcData, actions]
  );

  // Effect to run backtest when runConfig changes
  useEffect(() => {
    if (!state.runConfig || Object.keys(state.ohlcData).length === 0) {
      if (
        state.isBacktestLoading &&
        (!state.runConfig || Object.keys(state.ohlcData).length === 0)
      ) {
        actions.setBacktestLoading(false);
        if (!state.runConfig) {
          actions.setProgress({
            value: state.progress.value,
            message: "戦略が定義されていません。",
          });
        }
        if (Object.keys(state.ohlcData).length === 0) {
          actions.setProgress({
            value: state.progress.value,
            message: "OHLCデータがありません。",
          });
        }
      }
      return;
    }

    actions.setBacktestLoading(true);
    actions.resetBacktest();
    executeBacktest(state.runConfig.dsl, state.ohlcData);
  }, [
    state.runConfig,
    state.ohlcData,
    state.isBacktestLoading,
    executeBacktest,
    actions,
  ]);

  return (
    <div className="container mx-auto p-4 space-y-6">
      <ProgressBar
        progress={state.progress.value}
        message={state.progress.message}
      />

      <header className="flex justify-between items-center py-2 border-b mb-4">
        <h1 className="text-2xl font-bold">
          日本株クライアントサイド・バックテスト
        </h1>
        <button
          onClick={() => actions.setApiKeyModalOpen(true)}
          className="px-3 py-2 border rounded text-sm hover:bg-gray-100"
        >
          APIキー設定
        </button>
      </header>

      <ApiKeyModal
        isOpen={state.isApiKeyModalOpen}
        onClose={() => actions.setApiKeyModalOpen(false)}
      />

      {!apiKeys.jquants_refresh && !state.isApiKeyModalOpen && (
        <div className="p-4 bg-yellow-100 text-yellow-800 rounded">
          J-Quants Refresh
          Tokenが設定されていません。右上の「APIキー設定」からキーを登録してください。
        </div>
      )}

      {apiKeys.jquants_refresh && (
        <>
          <section className="space-y-4">
            <h2 className="text-xl font-semibold">1. 銘柄・期間の選択</h2>
            {!state.dataConfig ? (
              <StockPeriodSelector onSubmit={handleDataConfigSubmit} />
            ) : (
              <div className="bg-gray-50 p-4 rounded">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-medium">選択済み:</p>
                    <p>銘柄: {state.dataConfig.codes.join(", ")}</p>
                    <p>
                      期間: {state.dataConfig.startDate} 〜{" "}
                      {state.dataConfig.endDate}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      actions.resetData();
                    }}
                    className="text-blue-600 hover:text-blue-800"
                  >
                    変更
                  </button>
                </div>
                {state.isLoadingData && (
                  <p className="mt-2">
                    データ取得中...{" "}
                    {state.progress.message.includes("OHLCデータ取得中")
                      ? state.progress.message.split(": ")[1]
                      : ""}
                  </p>
                )}
                {state.dataError && (
                  <p className="mt-2 text-red-600">エラー: {state.dataError}</p>
                )}
                {!state.isLoadingData &&
                  !state.dataError &&
                  Object.keys(state.ohlcData).length > 0 && (
                    <p className="mt-2 text-green-600">
                      ✓ データ取得完了 ({Object.keys(state.ohlcData).length}/
                      {state.dataConfig?.codes?.length || 0}銘柄)
                      {Object.keys(state.ohlcData).length <
                        (state.dataConfig?.codes?.length || 0) && (
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
            {state.showDsl && state.validatedDsl && (
              <div className="mt-4 p-3 bg-gray-100 rounded">
                <h3 className="font-semibold">検証済みDSL:</h3>
                <pre className="text-sm whitespace-pre-wrap">
                  {JSON.stringify(state.validatedDsl, null, 2)}
                </pre>
              </div>
            )}
          </section>

          {(state.isBacktestLoading ||
            state.backtestResult ||
            state.backtestError) &&
            state.runConfig && (
              <section className="space-y-4">
                <h2 className="text-xl font-semibold">3. バックテスト結果</h2>
                {state.backtestResult && (
                  <BacktestResults
                    dsl={state.runConfig.dsl}
                    codes={state.runConfig.codes}
                    startDate={state.runConfig.startDate}
                    endDate={state.runConfig.endDate}
                    apiKey={apiKeys.openai || ""}
                    ohlcDataProp={state.ohlcData}
                    onProgressUpdate={(value, message) =>
                      actions.setProgress({ value, message })
                    }
                    backtestResponse={state.backtestResult}
                    isLoading={state.isBacktestLoading}
                    error={state.backtestError}
                  />
                )}
                {state.backtestError && (
                  <div className="p-4 bg-red-100 text-red-700 rounded">
                    <p className="font-bold">エラー:</p>
                    <p>{state.backtestError}</p>
                  </div>
                )}
              </section>
            )}
        </>
      )}
    </div>
  );
}

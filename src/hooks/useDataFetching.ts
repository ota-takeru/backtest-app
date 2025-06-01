import { useCallback } from "react";
import { ApiKeys } from "./useApiKeys";
import { OHLCFrameJSON } from "../lib/types";
import { fetchOHLC, refreshJQuantsIdTokenLogic } from "../lib/fetchJQuants";
import { StrategyAST } from "../types";

interface UseDataFetchingProps {
  apiKeys: ApiKeys;
  onTokenRefreshed: (newIdToken: string, newRefreshToken?: string) => void;
  onProgressUpdate: (value: number, message: string) => void;
  onDataError: (error: string | null) => void;
  onDataSuccess: (data: Record<string, OHLCFrameJSON>) => void;
  onLoadingChange: (loading: boolean) => void;
  validatedDsl?: StrategyAST | null;
}

export function useDataFetching({
  apiKeys,
  onTokenRefreshed,
  onProgressUpdate,
  onDataError,
  onDataSuccess,
  onLoadingChange,
  validatedDsl,
}: UseDataFetchingProps) {
  const fetchData = useCallback(
    async (codes: string[], startDate: string, endDate: string) => {
      if (!apiKeys.jquants_refresh) {
        onDataError(
          "E2001: J-Quants Refresh Tokenが設定されていません。設定画面を開いてください。"
        );
        return false;
      }

      onLoadingChange(true);
      onDataError(null);
      onProgressUpdate(5, "データ取得設定完了。OHLCデータ取得開始...");

      try {
        // Get ID token, refresh if necessary
        let currentIdToken = apiKeys.jquants_id;
        if (!currentIdToken) {
          onProgressUpdate(1, "IDトークン取得中... (初回リフレッシュ)");
          const refreshResult = await refreshJQuantsIdTokenLogic(
            apiKeys.jquants_refresh
          );
          if (refreshResult && refreshResult.newIdToken) {
            onTokenRefreshed(
              refreshResult.newIdToken,
              refreshResult.newRefreshToken
            );
            currentIdToken = refreshResult.newIdToken;
          } else {
            onDataError(
              "E2002: J-Quants IDトークンの取得/更新に失敗しました。Refresh Tokenを確認してください。"
            );
            onProgressUpdate(100, "IDトークン取得失敗");
            return false;
          }
        }

        // Fetch OHLC data for all codes with chunked processing to avoid UI blocking
        const newOhlcData: Record<string, OHLCFrameJSON> = {};
        let successfulFetches = 0;

        // Process codes in chunks to maintain UI responsiveness
        const CHUNK_SIZE = 3; // Process 3 codes at a time
        for (let i = 0; i < codes.length; i += CHUNK_SIZE) {
          const chunk = codes.slice(i, i + CHUNK_SIZE);

          // Process chunk in parallel
          const chunkPromises = chunk.map(async (code, chunkIndex) => {
            const globalIndex = i + chunkIndex;
            try {
              const frame = await fetchOHLC(
                currentIdToken!,
                apiKeys.jquants_refresh,
                onTokenRefreshed,
                code,
                startDate,
                endDate
              );

              // Update progress with yielding to allow UI updates
              await new Promise((resolve) => setTimeout(resolve, 0));
              onProgressUpdate(
                5 + ((globalIndex + 1) / codes.length) * 45,
                `OHLCデータ取得中: ${code} (${globalIndex + 1}/${codes.length})`
              );

              return { code, frame, index: globalIndex };
            } catch (error) {
              console.error(`Failed to fetch data for ${code}:`, error);
              return { code, frame: null, index: globalIndex };
            }
          });

          const chunkResults = await Promise.all(chunkPromises);

          // Process results and yield control back to UI
          for (const result of chunkResults) {
            if (result.frame) {
              newOhlcData[result.code] = result.frame;
              successfulFetches++;
            }
          }

          // Yield control to UI between chunks
          await new Promise((resolve) => setTimeout(resolve, 10));
        }

        onProgressUpdate(50, "全OHLCデータ取得完了。処理中...");

        if (successfulFetches === 0) {
          onDataError(
            "E2003: 指定された全ての銘柄・期間のOHLCデータを取得できませんでした。APIキー、銘柄コード、期間を確認してください。"
          );
          onProgressUpdate(100, "データ取得失敗");
          return false;
        } else if (successfulFetches < codes.length) {
          onDataError(
            `E2003: 一部の銘柄のOHLCデータ取得に失敗しました。取得成功: ${successfulFetches}/${codes.length}. 詳細はコンソールを確認してください。`
          );
        }

        onDataSuccess(newOhlcData);
        onProgressUpdate(55, "データ取得・処理完了。戦略定義待機中...");
        return true;
      } catch (error: any) {
        console.error("Data fetching process error:", error);
        onDataError(
          `E2003: OHLCデータ取得プロセス中にエラーが発生しました: ${
            error.message || String(error)
          }`
        );
        onProgressUpdate(100, "データ取得中にエラー発生");
        return false;
      } finally {
        onLoadingChange(false);
      }
    },
    [
      apiKeys,
      onTokenRefreshed,
      onProgressUpdate,
      onDataError,
      onDataSuccess,
      onLoadingChange,
      validatedDsl,
    ]
  );

  return { fetchData };
}

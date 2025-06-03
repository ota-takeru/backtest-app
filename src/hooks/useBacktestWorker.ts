import { useState, useEffect, useCallback, useRef } from "react";
import {
  BacktestRequest,
  BacktestResponse,
  WorkerMessage,
} from "../types/worker";

interface UseBacktestWorkerProps {
  onProgress: (value: number, message: string) => void;
  onResult: (result: BacktestResponse) => void;
  onError: (error: string) => void;
  onLoadingChange: (loading: boolean) => void;
  enableWorker?: boolean; // 新しいオプション：ワーカーを有効にするかどうか
}

export function useBacktestWorker({
  onProgress,
  onResult,
  onError,
  onLoadingChange,
  enableWorker = false, // デフォルトは無効
}: UseBacktestWorkerProps) {
  const [worker, setWorker] = useState<Worker | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);
  const workerRef = useRef<Worker | null>(null);

  // ワーカーの遅延初期化
  const initializeWorker = useCallback(async () => {
    if (workerRef.current || isInitializing || !enableWorker) {
      return;
    }

    setIsInitializing(true);
    onProgress(5, "DuckDB-WASMワーカーを初期化中...");

    try {
      // UIブロッキングを防ぐため、非同期でワーカーを作成
      await new Promise((resolve) => setTimeout(resolve, 100));

      const newWorker = new Worker(
        new URL("../worker/worker.ts", import.meta.url),
        { type: "module" }
      );

      setWorker(newWorker);
      workerRef.current = newWorker;
      onProgress(15, "ワーカー初期化完了");

      newWorker.onmessage = (event: MessageEvent<WorkerMessage>) => {
        const data = event.data;

        if (data.type === "progress") {
          onProgress(data.progress ?? 0, data.message ?? "");
        } else if (data.type === "result") {
          onResult(data);
          onLoadingChange(false);
          onProgress(100, "バックテスト完了");
        } else if (data.type === "error") {
          onError(data.message);
          onLoadingChange(false);
          onProgress(100, `エラー: ${data.message}`);
        }
      };

      newWorker.onerror = (errorEvent) => {
        console.error("Worker error:", errorEvent);
        onError(
          `E0008: Workerとの通信確立または初期化に失敗しました: ${errorEvent.message}`
        );
        onLoadingChange(false);
        onProgress(100, "Workerで致命的なエラーが発生しました。");
      };
    } catch (error) {
      onError(`ワーカー初期化エラー: ${error}`);
      onProgress(100, "ワーカー初期化失敗");
    } finally {
      setIsInitializing(false);
    }
  }, [
    onProgress,
    onResult,
    onError,
    onLoadingChange,
    enableWorker,
    isInitializing,
  ]);

  // クリーンアップ
  useEffect(() => {
    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
        setWorker(null);
        workerRef.current = null;
      }
    };
  }, []);

  const runBacktest = useCallback(
    async (request: BacktestRequest, transferableBuffer: ArrayBuffer) => {
      if (!enableWorker) {
        onError("ワーカーが無効化されています");
        return;
      }

      // ワーカーが未初期化の場合、初期化を行う
      if (!workerRef.current && !isInitializing) {
        await initializeWorker();
      }

      // 初期化を待つ
      while (isInitializing) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      if (!workerRef.current) {
        onError("Worker が初期化されていません");
        return;
      }

      console.log("[Worker] Sending backtest request:", {
        req_id: request.req_id,
        dsl_ast: request.dsl_ast,
        arrow_length: request.arrow.length,
        params: request.params,
      });

      onLoadingChange(true);
      workerRef.current.postMessage(request, [transferableBuffer]);
    },
    [onError, onLoadingChange, enableWorker, initializeWorker, isInitializing]
  );

  return {
    worker,
    runBacktest,
    isWorkerReady: worker !== null && !isInitializing,
    initializeWorker,
    isInitializing,
  };
}

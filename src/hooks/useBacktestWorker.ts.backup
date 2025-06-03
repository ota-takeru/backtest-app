import { useState, useEffect, useCallback, useRef } from "react";
import { BacktestRequest, BacktestResponse, WorkerMessage } from "../types";

interface UseBacktestWorkerProps {
  onProgress: (value: number, message: string) => void;
  onResult: (result: BacktestResponse) => void;
  onError: (error: string) => void;
  onLoadingChange: (loading: boolean) => void;
}

export function useBacktestWorker({
  onProgress,
  onResult,
  onError,
  onLoadingChange,
}: UseBacktestWorkerProps) {
  const [worker, setWorker] = useState<Worker | null>(null);
  const workerRef = useRef<Worker | null>(null);

  // Initialize worker
  useEffect(() => {
    const newWorker = new Worker(
      new URL("../worker/worker.ts", import.meta.url),
      { type: "module" }
    );

    setWorker(newWorker);
    workerRef.current = newWorker;

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

    return () => {
      newWorker.terminate();
      setWorker(null);
      workerRef.current = null;
    };
  }, [onProgress, onResult, onError, onLoadingChange]);

  const runBacktest = useCallback(
    (request: BacktestRequest, transferableBuffer: ArrayBuffer) => {
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
    [onError, onLoadingChange]
  );

  return {
    worker,
    runBacktest,
    isWorkerReady: worker !== null,
  };
}

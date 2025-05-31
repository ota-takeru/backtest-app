/**
 * リファクタリング後のWorkerメインファイル
 * 責任分離と依存性注入によってテスタブルな設計に変更
 */

import {
  BacktestRequest,
  BacktestResponse,
  WorkerErrorMessage,
  WorkerProgressMessage,
  WorkerResultMessage,
} from "../types";

// リファクタリングされたモジュール群
import { WorkerLogger, LogLevel } from "./logger";
import { ErrorHandler, ErrorFactory } from "./errorHandler";
import { createWorkerConfig } from "./config";
import { DuckDBManager } from "./duckDBManager";
import { ArrowDataLoader } from "./arrowDataLoader";
import { BacktestProcessor } from "./backtestProcessor";
import { ProgressReporter } from "./progressReporter";

/**
 * メインのWorkerクラス
 * 各モジュールを組み合わせてバックテスト処理を実行
 */
class BacktestWorker {
  public readonly logger: WorkerLogger; // publicに変更
  private errorHandler: ErrorHandler;
  private duckDBManager: DuckDBManager;
  private arrowDataLoader: ArrowDataLoader;
  private backtestProcessor: BacktestProcessor;
  private config = createWorkerConfig();

  constructor() {
    this.logger = new WorkerLogger("BacktestWorker", LogLevel.INFO);
    this.errorHandler = new ErrorHandler(this.logger);

    this.duckDBManager = new DuckDBManager(
      this.config.duckdb,
      this.logger,
      this.errorHandler
    );

    this.arrowDataLoader = new ArrowDataLoader(
      this.config.arrow,
      this.duckDBManager,
      this.logger,
      this.errorHandler
    );

    this.backtestProcessor = new BacktestProcessor(
      this.duckDBManager,
      this.logger,
      this.errorHandler
    );
  }

  async processRequest(request: BacktestRequest): Promise<void> {
    const { req_id, dsl_ast, arrow, params } = request;

    const progressReporter = new ProgressReporter(req_id, (message) =>
      self.postMessage(message)
    );

    let conn: any = null;

    try {
      progressReporter.start();

      // 入力検証
      this.validateInput(request);

      // 1. DuckDB初期化
      await this.duckDBManager.initialize();
      conn = await this.duckDBManager.createConnection();
      await this.duckDBManager.testCapabilities(conn);

      // 2. Arrowデータ読み込み
      await this.arrowDataLoader.loadArrowData(conn, arrow);
      await this.arrowDataLoader.verifyTable(conn);
      progressReporter.dbInitialized();

      // 3. バックテスト実行
      progressReporter.sqlExecuting();
      const results = await this.backtestProcessor.executeBacktest(
        conn,
        dsl_ast,
        params
      );
      progressReporter.sqlCompleted();

      // 4. 結果検証と送信
      const validationIssues = this.backtestProcessor.validateResults({
        metrics: results.metrics,
        equityCurve: results.equityCurve,
        trades: results.trades,
      });
      const responseData: BacktestResponse = {
        req_id,
        metrics: results.metrics,
        equityCurve: results.equityCurve,
        trades: results.trades,
        warnings: [...results.warnings, ...validationIssues],
      };

      progressReporter.resultsProcessed();

      self.postMessage({
        type: "result",
        ...responseData,
      } as WorkerResultMessage);

      progressReporter.completed();
    } catch (error: any) {
      this.logger.error("Request processing failed", error);
      this.errorHandler.postError(
        req_id,
        this.errorHandler.handleError(error, "REQUEST_PROCESSING"),
        (message) => self.postMessage(message)
      );
    } finally {
      if (conn) {
        try {
          await conn.close();
        } catch (closeErr: any) {
          this.logger.warn("Error closing DB connection", closeErr.message);
        }
      }
    }
  }

  private validateInput(request: BacktestRequest): void {
    if (!request.dsl_ast) {
      throw this.errorHandler.createError(
        ErrorFactory.missingInput("戦略定義(dsl_ast)")
      );
    }
    if (!request.arrow) {
      throw this.errorHandler.createError(
        ErrorFactory.missingInput("Arrowデータ(arrow)")
      );
    }
    if (!request.params) {
      throw this.errorHandler.createError(
        ErrorFactory.missingInput("パラメータ(params)")
      );
    }
  }
}

// Workerインスタンス作成と初期化
const worker = new BacktestWorker();

// メッセージハンドラー
self.onmessage = async (event: MessageEvent<BacktestRequest>) => {
  try {
    worker.logger.info("Received message", {
      req_id: event.data.req_id,
      hasArrow: !!event.data.arrow,
      hasDslAst: !!event.data.dsl_ast,
    });

    await worker.processRequest(event.data);
  } catch (error: any) {
    worker.logger.error("Unhandled error in onmessage", error);
    self.postMessage({
      type: "error",
      req_id: event.data?.req_id || "unknown",
      message: `E3001: Worker内で予期せぬエラーが発生しました - ${error.message}`,
    } as WorkerErrorMessage);
  }
};

console.log("BacktestWorker (リファクタリング版) loaded successfully");

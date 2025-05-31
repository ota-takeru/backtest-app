/**
 * バックテスト処理実行クラス
 * バックテストの実行とSQLクエリの管理を担当
 */

import * as duckdb from "@duckdb/duckdb-wasm";
import { StrategyAST, BacktestResponse, TradeRow } from "../types";
import { WorkerLogger } from "./logger";
import { ErrorHandler, ErrorFactory, WorkerError } from "./errorHandler";
import { DuckDBManager } from "./duckDBManager";
import { astToSql, AstToSqlError } from "./astToSql";

export interface BacktestParams {
  initCash: number;
  slippageBp: number;
}

export class BacktestProcessor {
  private logger: WorkerLogger;
  private errorHandler: ErrorHandler;

  constructor(
    private duckDBManager: DuckDBManager,
    parentLogger: WorkerLogger,
    errorHandler: ErrorHandler
  ) {
    this.logger = parentLogger.createChildLogger("BacktestProcessor");
    this.errorHandler = errorHandler;
  }

  async executeBacktest(
    conn: duckdb.AsyncDuckDBConnection,
    dsl_ast: StrategyAST,
    params: BacktestParams,
    tableName: string = "ohlc_data"
  ): Promise<{
    metrics: BacktestResponse["metrics"];
    equityCurve: BacktestResponse["equityCurve"];
    trades: BacktestResponse["trades"];
    warnings: string[];
  }> {
    try {
      this.logger.info("Starting backtest execution", {
        initCash: params.initCash,
        slippageBp: params.slippageBp,
        tableName,
      });

      // 1. AST -> SQL 変換
      const sqlQuery = this.convertAstToSql(dsl_ast, params, tableName);

      // 2. SQLクエリ実行
      const rawResults = await this.executeSqlQuery(conn, sqlQuery);

      // 3. 結果データの処理
      const processedResults = this.processResults(rawResults);

      this.logger.info("Backtest execution completed successfully");
      return processedResults;
    } catch (error) {
      if (error instanceof WorkerError) {
        throw error;
      }
      throw this.errorHandler.createError(
        ErrorFactory.resultProcessing((error as Error).message, error as Error)
      );
    }
  }

  private convertAstToSql(
    dsl_ast: StrategyAST,
    params: BacktestParams,
    tableName: string
  ): string {
    try {
      this.logger.info("Converting AST to SQL", {
        entry: dsl_ast.entry,
        exit: dsl_ast.exit,
      });

      const sqlQuery = astToSql(
        dsl_ast,
        params.initCash,
        params.slippageBp,
        tableName
      );

      this.logger.debug("Generated SQL query", {
        query:
          sqlQuery.substring(0, 500) + (sqlQuery.length > 500 ? "..." : ""),
        fullLength: sqlQuery.length,
      });

      return sqlQuery;
    } catch (error) {
      if (error instanceof AstToSqlError) {
        throw this.errorHandler.createError(
          ErrorFactory.astToSqlConversion(
            error.message,
            error.details ? { details: error.details } : undefined
          )
        );
      }
      throw this.errorHandler.createError(
        ErrorFactory.astToSqlConversion((error as Error).message)
      );
    }
  }

  private async executeSqlQuery(
    conn: duckdb.AsyncDuckDBConnection,
    sqlQuery: string
  ): Promise<any[]> {
    try {
      this.logger.info("Executing backtest SQL query");
      const results = await this.duckDBManager.executeQuery(conn, sqlQuery);

      this.logger.info("SQL execution completed", {
        resultCount: results.length,
        sampleResults: results.slice(0, 3),
      });

      return results;
    } catch (error) {
      throw this.errorHandler.createError(
        ErrorFactory.sqlExecution((error as Error).message, error as Error)
      );
    }
  }

  private processResults(rawResults: any[]): {
    metrics: BacktestResponse["metrics"];
    equityCurve: BacktestResponse["equityCurve"];
    trades: BacktestResponse["trades"];
    warnings: string[];
  } {
    try {
      this.logger.info("Processing backtest results", {
        totalResults: rawResults.length,
      });

      if (!rawResults || rawResults.length === 0) {
        throw new Error("SQL実行結果が空です");
      }

      // メトリクスの抽出
      const metricsData = rawResults.find((r) => r.type === "metrics");
      const metrics: BacktestResponse["metrics"] = metricsData
        ? {
            cagr: metricsData.cagr ?? null,
            maxDd: metricsData.maxDd ?? null,
            sharpe: metricsData.sharpe ?? null,
          }
        : null;

      // エクイティカーブの抽出
      const equityCurve = rawResults
        .filter((r) => r.type === "equity_point")
        .map((r) => ({
          date: r.date,
          equity: r.equity,
        }));

      // トレードログの抽出
      const trades: TradeRow[] = rawResults
        .filter((r) => r.type === "trade_log")
        .map((r) => ({
          date: r.date,
          side: r.side,
          price: r.price,
          quantity: r.quantity,
          pnl: r.pnl,
        }));

      // 警告メッセージの抽出
      const warnings = rawResults
        .filter((r) => r.type === "warning")
        .map((r) => r.message);

      this.logger.info("Results processed successfully", {
        hasMetrics: !!metrics,
        equityCurvePoints: equityCurve.length,
        tradesCount: trades.length,
        warningsCount: warnings.length,
      });

      return {
        metrics,
        equityCurve,
        trades,
        warnings,
      };
    } catch (error) {
      throw this.errorHandler.createError(
        ErrorFactory.resultProcessing((error as Error).message, error as Error)
      );
    }
  }

  /**
   * バックテスト結果の妥当性をチェック
   */
  validateResults(results: {
    metrics: BacktestResponse["metrics"];
    equityCurve: BacktestResponse["equityCurve"];
    trades: BacktestResponse["trades"];
  }): string[] {
    const issues: string[] = [];

    // メトリクスの妥当性チェック
    if (results.metrics) {
      if (results.metrics.cagr !== null && isNaN(results.metrics.cagr)) {
        issues.push("CAGR値が無効です");
      }
      if (results.metrics.maxDd !== null && isNaN(results.metrics.maxDd)) {
        issues.push("MaxDD値が無効です");
      }
      if (results.metrics.sharpe !== null && isNaN(results.metrics.sharpe)) {
        issues.push("Sharpe Ratio値が無効です");
      }
    }

    // エクイティカーブの妥当性チェック
    if (results.equityCurve.length === 0) {
      issues.push("エクイティカーブデータがありません");
    }

    // トレードの妥当性チェック
    const invalidTrades = results.trades.filter(
      (trade) => typeof trade.price !== "number" || isNaN(trade.price)
    );
    if (invalidTrades.length > 0) {
      issues.push(`${invalidTrades.length}件の無効なトレードデータがあります`);
    }

    if (issues.length > 0) {
      this.logger.warn("Result validation issues found", issues);
    }

    return issues;
  }
}

import * as duckdb from "@duckdb/duckdb-wasm";
import {
  BacktestRequest,
  // WorkerMessage, // Worker自身は送信側なので、受信メッセージ型はBacktestRequest
  BacktestResponse, // 送信する結果の型
  TradeRow,
  StrategyAST, // StrategyDSLからStrategyASTに変更
  WorkerErrorMessage, // エラーメッセージ型を追加
  WorkerProgressMessage, // 進捗メッセージ型
  WorkerResultMessage, // 結果メッセージ型
} from "../types"; // インポートパスを修正
// import { parseBoolExpr, astToSqlPredicate } from "../lib/dsl-compiler"; // これは新しいAST->SQLコンパイラに置き換えられる想定
import { astToSql, AstToSqlError } from "./astToSql"; // 新しいAST->SQLコンパイラをインポート

const logger = new duckdb.ConsoleLogger();
let mainBundle: duckdb.DuckDBBundle | null = null;
let db: duckdb.AsyncDuckDB | null = null;

async function initializeDBAndRegisterOHLC(
  req_id: string, // req_idをエラー通知のために渡す
  arrowBuffer: Uint8Array
): Promise<duckdb.AsyncDuckDBConnection> {
  try {
    if (!mainBundle) {
      mainBundle = await duckdb.selectBundle(duckdb.getJsDelivrBundles());
    }
    if (!db) {
      const worker = await duckdb.createWorker(mainBundle!.mainWorker!);
      db = new duckdb.AsyncDuckDB(logger, worker);
      await db.instantiate(mainBundle!.mainModule, mainBundle!.pthreadWorker);
      await db.open({ query: { castBigIntToDouble: true } });
      console.log("DuckDB-WASM initialized.");
    }
    const conn = await db.connect();
    await db.registerFileBuffer("input_arrow.arrow", arrowBuffer);
    await conn.query(
      "CREATE OR REPLACE TABLE ohlc_data AS SELECT * FROM 'input_arrow.arrow';"
    );
    return conn;
  } catch (e: any) {
    console.error("[Worker] DB Initialization/Registration Error:", e);
    // E0008 Worker初期化失敗 に近いが、より汎用的な E1005 を使用
    // REQUIREMENTS.md §9 に合わせ、E3001 または E3002 を使用
    const errorCode =
      e.message?.includes("Arrow") || e.message?.includes("registerFileBuffer")
        ? "E3002"
        : "E3001";
    self.postMessage({
      type: "error",
      req_id,
      message: `${errorCode}: DuckDB初期化/データ登録エラー: ${e.message}`,
    } as WorkerErrorMessage);
    throw e; // エラーを再スローして処理を中断
  }
}

self.onmessage = async (event: MessageEvent<BacktestRequest>) => {
  const { req_id, dsl_ast, arrow, params } = event.data;
  let conn: duckdb.AsyncDuckDBConnection | null = null;

  const postProgress = (progress: number, message: string) => {
    self.postMessage({
      type: "progress",
      req_id,
      progress,
      message,
    } as WorkerProgressMessage);
  };

  const postError = (
    errorCode: string,
    errorMessage: string,
    details?: string
  ) => {
    self.postMessage({
      type: "error",
      req_id,
      message: `${errorCode}: ${errorMessage}${details ? " - " + details : ""}`,
    } as WorkerErrorMessage);
  };

  try {
    postProgress(10, "バックテスト処理開始...");

    if (!dsl_ast) {
      // postError("E1005", "戦略定義(dsl_ast)が提供されていません。");
      postError("E3001", "戦略定義(dsl_ast)が提供されていません。");
      return;
    }
    if (!arrow) {
      // postError("E1005", "Arrowデータ(arrow)が提供されていません。");
      postError("E3001", "Arrowデータ(arrow)が提供されていません。");
      return;
    }

    conn = await initializeDBAndRegisterOHLC(req_id, arrow);
    postProgress(20, "DB初期化・データ登録完了。");

    // 1. AST -> SQL 変換 (E1002)
    let main_sql_query: string;
    try {
      main_sql_query = astToSql(
        dsl_ast,
        params.initCash,
        params.slippageBp,
        "ohlc_data"
      );
      console.log("[Worker] Generated SQL:", main_sql_query);
      postProgress(40, "SQL生成完了。");
    } catch (e: any) {
      if (e instanceof AstToSqlError) {
        postError(
          "E1002",
          "戦略のSQL変換に失敗しました",
          e.message + (e.details ? ` (${JSON.stringify(e.details)})` : "")
        );
      } else {
        postError(
          "E1002",
          "戦略のSQL変換中に予期せぬエラーが発生しました",
          e.message
        );
      }
      return;
    }

    // 2. DuckDB SQL実行 (E3001)
    let rawResults: any[];
    try {
      console.log("[Worker] Executing main backtest SQL...");
      const queryResult = await conn.query(main_sql_query); // main_sql_query が結果を返す想定
      rawResults = queryResult.toArray().map((row) => row.toJSON()); // 結果をJSONオブジェクトの配列に

      postProgress(70, "バックテストSQL実行完了。");
    } catch (e: any) {
      // postError(
      //   "E1003",
      //   "バックテストSQLの実行に失敗しました",
      //   e.message + (e.detail ? ` (${e.detail.toString()})` : "")
      // );
      postError(
        "E3001",
        "バックテストSQLの実行に失敗しました (DuckDB実行時エラー)",
        e.message + (e.detail ? ` (${e.detail.toString()})` : "")
      );
      return;
    }

    // 3. 結果データ処理 (E3001の一部として、またはより具体的なメッセージで)
    let responseData: BacktestResponse;
    try {
      if (!rawResults || rawResults.length === 0) {
        throw new Error("SQL実行結果が空です。");
      }

      const metrics = rawResults.find((r) => r.type === "metrics") || {
        cagr: null,
        maxDd: null,
        sharpe: null,
      };
      const equityCurve = rawResults
        .filter((r) => r.type === "equity_point")
        .map((r) => ({ date: r.date, equity: r.equity }));
      const trades = rawResults
        .filter((r) => r.type === "trade_log")
        .map((r) => ({
          date: r.date,
          side: r.side,
          price: r.price,
          quantity: r.quantity,
          pnl: r.pnl,
        }));
      const warnings = rawResults
        .filter((r) => r.type === "warning")
        .map((r) => r.message);

      responseData = {
        req_id,
        metrics: metrics.cagr === undefined ? null : metrics,
        equityCurve,
        trades,
        warnings: warnings.length > 0 ? warnings : undefined,
      };
      postProgress(90, "結果データ処理完了。");
    } catch (e: any) {
      // postError(
      //   "E1004",
      //   "バックテスト結果の処理中にエラーが発生しました",
      //   e.message
      // );
      postError(
        "E3001", // E1004 は廃止し、E3001 に統合 (Worker内部処理エラー)
        "バックテスト結果の解析・処理中にエラーが発生しました",
        e.message
      );
      return;
    }

    self.postMessage({
      type: "result",
      ...responseData,
    } as WorkerResultMessage);
  } catch (e: any) {
    console.error("[Worker] Unhandled error in onmessage:", e);
    // postError("E1005", "Worker内で不明なエラーが発生しました", e.message);
    postError("E3001", "Worker内で予期せぬエラーが発生しました", e.message);
  } finally {
    if (conn) {
      try {
        await conn.close();
      } catch (closeErr: any) {
        console.warn("[Worker] Error closing DB connection:", closeErr.message);
      }
    }
    postProgress(100, "バックテスト処理終了。");
  }
};

console.log("Worker script (with SQL pipeline structure) loaded");

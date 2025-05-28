import * as duckdb from "@duckdb/duckdb-wasm";
import {
  BacktestRequest,
  WorkerMessage,
  BacktestResponse,
  TradeRow,
} from "../types/worker";
import { StrategyDSL } from "../types/dsl"; // StrategyDSL をインポート
import { parseBoolExpr, astToSqlPredicate } from "../lib/dsl-compiler"; // dsl-compiler から関数をインポート

// DuckDBインスタンスと設定
const logger = new duckdb.ConsoleLogger(); // グローバルスコープに logger を定義
let mainBundle: duckdb.DuckDBBundle | null = null; // mainBundle もグローバルに、初期化は後で

let db: duckdb.AsyncDuckDB | null = null;

async function initializeDBAndRegisterOHLC(
  arrowBuffer: Uint8Array
): Promise<duckdb.AsyncDuckDBConnection> {
  if (!mainBundle) {
    // mainBundleが未初期化の場合のみ実行
    mainBundle = await duckdb.selectBundle(duckdb.getJsDelivrBundles());
  }
  if (!db) {
    const worker = await duckdb.createWorker(mainBundle!.mainWorker!); // ! を使用
    db = new duckdb.AsyncDuckDB(logger, worker);
    await db.instantiate(mainBundle!.mainModule, mainBundle!.pthreadWorker); // ! を使用し、pthreadWorkerを参照
    await db.open({ query: { castBigIntToDouble: true } });
    console.log("DuckDB-Wasm initialized.");
  }
  const conn = await db.connect();

  // UDFs の登録をコメントアウト
  /*
  await conn.query(\`
    CREATE OR REPLACE FUNCTION udf_rsi(price DOUBLE, period INTEGER)
    RETURNS DOUBLE AS $$
      WITH diffs AS (
        SELECT price - lag(price) OVER (ORDER BY rowid) AS dp
      ),
      pos AS (SELECT sum(greatest(dp,0))/period FROM diffs),
      neg AS (SELECT abs(sum(least(dp,0)))/period FROM diffs)
      SELECT 100 - 100/(1 + pos/neg);
    $$;
  \`);
  await conn.query(\`
    CREATE OR REPLACE FUNCTION udf_atr(current_high DOUBLE, current_low DOUBLE, current_close DOUBLE, period INTEGER)
    RETURNS DOUBLE AS $$
      SELECT GREATEST(
        current_high - current_low,
        ABS(current_high - LAG(current_close, 1, current_close) OVER (ORDER BY rowid)),
        ABS(current_low - LAG(current_close, 1, current_close) OVER (ORDER BY rowid))
      );
    $$;
  \`);
  */
  console.log("SQL UDF registration skipped.");

  await db.registerFileBuffer("input_arrow.arrow", arrowBuffer);
  console.log("Buffer 'input_arrow.arrow' registered.");

  // デバッグ用: 登録したバッファを直接クエリしてみる
  try {
    // const debugQuery = "SELECT COUNT(*) as count FROM read_ipc('input_arrow.arrow');"; // これも試す
    const debugQuery = "SELECT COUNT(*) as count FROM 'input_arrow.arrow';";
    console.log(`[Worker Debug] Executing debug query: ${debugQuery}`);
    const debugResult = await conn.query(debugQuery);
    console.log(
      "[Worker Debug] Debug query result:",
      debugResult.toArray().map((r) => r.toJSON())
    );
  } catch (e: any) {
    console.error(
      "[Worker Debug] Error during debug query:",
      e.message,
      e.detail && typeof e.detail.toString === "function"
        ? e.detail.toString()
        : e.detail || e.toString()
    );
  }

  // 元のテーブル作成
  try {
    await conn.query(
      "CREATE OR REPLACE TABLE ohlc_data AS SELECT * FROM 'input_arrow.arrow';"
    );
    console.log(
      "ohlc_data table potentially created from 'input_arrow.arrow'."
    );
  } catch (e: any) {
    console.error(
      "[Worker] Error creating ohlc_data table:",
      e.message,
      e.detail && typeof e.detail.toString === "function"
        ? e.detail.toString()
        : e.detail || e.toString()
    );
  }

  return conn;
}

self.onmessage = async (
  event: MessageEvent<BacktestRequest & { dsl: StrategyDSL }>
) => {
  const { req_id, arrow, params, dsl } = event.data;

  let conn: duckdb.AsyncDuckDBConnection | null = null;

  try {
    if (!dsl) {
      throw new Error(
        "StrategyDSL (dsl) object not provided in BacktestRequest."
      );
    }
    if (!arrow) {
      throw new Error("Arrow data (arrow) not provided in BacktestRequest.");
    }

    conn = await initializeDBAndRegisterOHLC(arrow);

    const entry_predicate_sql = astToSqlPredicate(
      parseBoolExpr(dsl.entry.condition),
      "ohlc_with_indicators"
    );
    const exit_predicate_sql = astToSqlPredicate(
      parseBoolExpr(dsl.exit.condition),
      "ohlc_with_indicators"
    );

    const slippage_pct = (params.slippageBp || 0) / 10000;
    const stockCode = dsl.universe[0] || "<unknown_code>";

    function getIndicatorsFromDsl(
      dslString: string
    ): { name: string; column?: string; period: number }[] {
      const indicators: { name: string; column?: string; period: number }[] =
        [];
      const regex =
        /(ma|rsi|atr)\s*\(\s*(?:([a-zA-Z_][a-zA-Z0-9_]*)\s*,\s*)?(\d+)\s*\)/gi;
      let match;
      while ((match = regex.exec(dslString)) !== null) {
        const indicatorName = match[1].toLowerCase();
        let periodStr: string;
        let columnName: string | undefined = undefined;

        if (match[2] && match[3]) {
          // func(col, period)
          columnName =
            match[2].toLowerCase() === "price"
              ? "close"
              : match[2].toLowerCase();
          periodStr = match[3];
        } else if (match[2]) {
          // func(period) - because match[2] can be period if match[3] is undefined
          periodStr = match[2];
        } else {
          continue; // Should not happen with the regex
        }
        const period = parseInt(periodStr, 10);

        if (indicatorName === "ma") {
          indicators.push({
            name: "ma",
            column: columnName || "close",
            period,
          });
        } else if (indicatorName === "rsi" || indicatorName === "atr") {
          indicators.push({ name: indicatorName, period }); // rsi/atr は対象カラムを内部で決定
        }
      }
      const uniqueIndicators = Array.from(
        new Map(
          indicators.map((item) => [
            `${item.name}_${item.column || ""}_${item.period}`,
            item,
          ])
        ).values()
      );
      return uniqueIndicators;
    }

    const allConditions = `${dsl.entry.condition} ${dsl.exit.condition || ""}`;
    const usedIndicators = getIndicatorsFromDsl(allConditions);
    console.log("[Worker] Used indicators based on DSL:", usedIndicators);

    let indicatorCteSql = "";
    let indicatorJoinClauses: string[] = [];
    let indicatorSelectColumns: string[] = [];

    usedIndicators.forEach((ind) => {
      const baseTable = "ohlc_data_with_id";
      let cteName = "";
      let valueColumnName = "";

      if (ind.name === "ma") {
        const col = ind.column || "close";
        cteName = `ma_${col}_${ind.period}`;
        valueColumnName = `${cteName}_value`;
        indicatorCteSql += `
  ${cteName} AS (
    SELECT date, AVG(${col}) OVER (ORDER BY date ROWS BETWEEN ${
          ind.period - 1
        } PRECEDING AND CURRENT ROW) as ${valueColumnName}
    FROM ${baseTable}
  ),`;
      } else if (ind.name === "rsi") {
        cteName = `rsi_${ind.period}`;
        valueColumnName = `${cteName}_value`;
        indicatorCteSql += `
  diffs_rsi_${ind.period} AS (
    SELECT date, close - LAG(close, 1, close) OVER (ORDER BY date) as diff
    FROM ${baseTable}
  ),
  avg_gain_loss_rsi_${ind.period} AS (
    SELECT
      date,
      AVG(CASE WHEN diff > 0 THEN diff ELSE 0 END) OVER (ORDER BY date ROWS BETWEEN ${
        ind.period - 1
      } PRECEDING AND CURRENT ROW) as avg_gain,
      AVG(CASE WHEN diff < 0 THEN ABS(diff) ELSE 0 END) OVER (ORDER BY date ROWS BETWEEN ${
        ind.period - 1
      } PRECEDING AND CURRENT ROW) as avg_loss
    FROM diffs_rsi_${ind.period}
  ),
  ${cteName} AS (
    SELECT
      date,
      CASE
        WHEN avg_loss = 0 THEN 100.0
        ELSE 100.0 - (100.0 / (1.0 + (avg_gain / avg_loss)))
      END as ${valueColumnName}
    FROM avg_gain_loss_rsi_${ind.period}
  ),`;
      } else if (ind.name === "atr") {
        cteName = `atr_${ind.period}`;
        valueColumnName = `${cteName}_value`;
        indicatorCteSql += `
  tr_atr_${ind.period} AS (
    SELECT
      date,
      GREATEST(
        high - low,
        ABS(high - LAG(close, 1, close) OVER (ORDER BY date)),
        ABS(low - LAG(close, 1, close) OVER (ORDER BY date))
      ) as tr_value
    FROM ${baseTable}
  ),
  ${cteName} AS (
    SELECT
      date,
      AVG(tr_value) OVER (ORDER BY date ROWS BETWEEN ${
        ind.period - 1
      } PRECEDING AND CURRENT ROW) as ${valueColumnName}
    FROM tr_atr_${ind.period}
  ),`;
      }
      if (cteName && valueColumnName) {
        indicatorJoinClauses.push(`LEFT JOIN ${cteName} USING (date)`);
        indicatorSelectColumns.push(
          `${cteName}.${valueColumnName} AS ${cteName.replace(
            `_${ind.column || "close"}_`,
            "_"
          )}`
        ); // ma_close_5 -> ma_5
      }
    });
    if (indicatorCteSql.endsWith(",")) {
      indicatorCteSql = indicatorCteSql.slice(0, -1); // 最後のカンマを削除
    }

    // SQLを簡略化してテスト
    const simplifiedSql = `
WITH
  ohlc_data_with_id AS (
    SELECT 
        strftime(date, '%Y-%m-%dT%H:%M:%SZ') as date,
        open, high, low, close, volume,
        row_number() OVER (ORDER BY date) as rn 
    FROM ohlc_data
  )
  -- ${
    indicatorCteSql ? `,${indicatorCteSql}` : ""
  } -- 指標CTEを一時的にコメントアウト
SELECT * FROM ohlc_data_with_id
-- ${indicatorJoinClauses.join("\n")} -- JOINも一時的にコメントアウト
LIMIT 10;
    `;

    console.log("[Worker] Executing SIMPLIFIED SQL:", simplifiedSql);
    const tempResults = await conn.query(simplifiedSql);
    console.log("[Worker] Temp results (simplified SQL):");
    tempResults.toArray().forEach((row) => console.log(row.toJSON()));

    postMessage({
      type: "result",
      req_id,
      equityCurve: [],
      trades: [],
      metrics: {
        cagr: 0,
        maxDd: 0,
        sharpe: 0,
        trades: 0,
        winRate: null,
        avgWinLoss: null,
        profitFactor: null,
        a_VaR: null,
        a_ES: null,
        a_SR: null,
        a_SoR: null,
        a_IR: null,
      },
    } as BacktestResponse);
  } catch (err: any) {
    console.error(
      `[Worker Error] req_id: ${req_id}, Error Type: ${err?.constructor?.name}, Message: ${err?.message}, Stack: ${err?.stack}`
    );
    if (err && typeof err.toString === "function") {
      console.error(`[Worker Error Detail] ${err.toString()}`);
    }
    if (err && err.detail) {
      console.error(`[Worker Error DuckDB Detail] ${err.detail}`);
    }
    postMessage({
      type: "error",
      req_id,
      message: err.message || "Unknown worker error",
      code: "E3001",
    } as WorkerMessage);
  } finally {
    if (conn) {
      await conn.close();
    }
  }
};

console.log("Worker script (with SQL pipeline structure) loaded");

console.log("Worker script (with SQL pipeline structure) loaded");

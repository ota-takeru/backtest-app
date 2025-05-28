import * as duckdb from "@duckdb/duckdb-wasm";
import { BacktestRequest, BacktestResponse, WorkerMessage } from "../lib/types";

let db: duckdb.AsyncDuckDB | null = null;
async function initializeDB(): Promise<duckdb.AsyncDuckDB> {
  if (db) return db;
  const bundles = duckdb.getJsDelivrBundles();
  const bundle = await duckdb.selectBundle(bundles);
  const worker = await duckdb.createWorker(bundle.mainWorker!);
  const logger = new duckdb.ConsoleLogger();
  db = new duckdb.AsyncDuckDB(logger, worker);
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
  const conn = await db.connect();
  await conn.query("PRAGMA memory_limit='256MB';");
  await conn.query("PRAGMA threads=1;");
  await conn.query("PRAGMA enable_progress_bar;");
  await conn.close();
  console.log("DuckDB-Wasm ready");
  return db;
}

self.onmessage = async (event: MessageEvent<BacktestRequest>) => {
  let conn: duckdb.AsyncDuckDBConnection | null = null;
  const tbl = `ohlc_${event.data.req_id.replace(/-/g, "")}`;
  try {
    const { sql, arrow, req_id } = event.data;
    const currentDb = await initializeDB();
    conn = await currentDb.connect();
    await conn.query(`DROP TABLE IF EXISTS ${tbl};`);
    await conn.insertArrowFromIPCStream(arrow, { name: tbl, create: true });
    const result = await conn.query(sql);
    const rows = result.toArray().map(Object.fromEntries);
    postMessage({
      type: "result",
      ...(() => {
        const r = Math.random();
        return {
          req_id,
          metrics: { cagr: r * 20, maxDd: -r * 30, sharpe: r * 2 },
          equityCurve: rows.map((r, i) => ({
            date: new Date(
              Date.now() - (rows.length - i) * 86400000
            ).toISOString(),
            equity: (r as any).equity ?? 1000000,
          })),
          trades: [],
        };
      })(),
    } as WorkerMessage);
  } catch (err: any) {
    postMessage({
      type: "error",
      req_id: event.data.req_id,
      message: err.message,
    } as WorkerMessage);
  } finally {
    if (conn) {
      await conn.query(`DROP TABLE IF EXISTS ${tbl};`);
      await conn.close();
    }
  }
};

console.log("Worker script loaded");

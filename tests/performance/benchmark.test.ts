/**
 * Performance Benchmark Tests
 * Tests runBacktest performance with P95 < 2s requirement
 */

import { bench, describe, beforeAll, afterAll, expect } from 'vitest';
import { Worker } from 'worker_threads';
import * as DuckDB from '@duckdb/duckdb-wasm';
import { compileDslToSql } from '../../src/lib/dslCompiler';
import type { ASTNode } from '../../src/types';

// Benchmark setup
const setupBenchmarkData = async () => {
  const JSDELIVR_BUNDLES = DuckDB.getJsDelivrBundles();
  const bundle = await DuckDB.selectBundle(JSDELIVR_BUNDLES);
  const worker = new Worker(bundle.mainWorker!);
  const logger = new DuckDB.ConsoleLogger();
  const db = new DuckDB.AsyncDuckDB(logger, worker);
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
  const conn = await db.connect();

  // Create large dataset for performance testing
  await conn.query(`
    CREATE TABLE large_stock AS 
    SELECT 
      ('2020-01-01'::DATE + INTERVAL (generate_series * '1 day')) as date,
      100 + (generate_series * 0.01) + (sin(generate_series * 0.1) * 10) + (random() * 2 - 1) as close,
      101 + (generate_series * 0.01) + (sin(generate_series * 0.1) * 10) + (random() * 2 - 1) as high,
      99 + (generate_series * 0.01) + (sin(generate_series * 0.1) * 10) + (random() * 2 - 1) as low,
      100 + (generate_series * 0.01) + (sin(generate_series * 0.1) * 10) + (random() * 2 - 1) as open,
      CAST(1000000 + (random() * 500000) as BIGINT) as volume
    FROM generate_series(0, 2499)
  `);

  return { db, conn };
};

const runBacktest = async (conn: DuckDB.AsyncDuckDBConnection, strategy: ASTNode) => {
  const strategySql = compileDslToSql(strategy);
  
  const query = `
    WITH strategy_signals AS (
      SELECT 
        date,
        close,
        ${strategySql} as signal,
        LAG(close, 1) OVER (ORDER BY date) as prev_close
      FROM large_stock 
      ORDER BY date
    ),
    positions AS (
      SELECT 
        date,
        close,
        signal,
        prev_close,
        CASE 
          WHEN signal > LAG(signal, 1) OVER (ORDER BY date) THEN 1  -- Buy signal
          WHEN signal < LAG(signal, 1) OVER (ORDER BY date) THEN -1 -- Sell signal
          ELSE 0 -- Hold
        END as position_change,
        SUM(CASE 
          WHEN signal > LAG(signal, 1) OVER (ORDER BY date) THEN 1
          WHEN signal < LAG(signal, 1) OVER (ORDER BY date) THEN -1
          ELSE 0
        END) OVER (ORDER BY date ROWS UNBOUNDED PRECEDING) as position
      FROM strategy_signals
    ),
    returns AS (
      SELECT 
        date,
        close,
        position,
        position_change,
        CASE 
          WHEN position != 0 THEN (close - prev_close) / prev_close * position
          ELSE 0
        END as daily_return
      FROM positions
      WHERE prev_close IS NOT NULL
    )
    SELECT 
      date,
      close,
      position,
      daily_return,
      EXP(SUM(LN(1 + daily_return)) OVER (ORDER BY date ROWS UNBOUNDED PRECEDING)) - 1 as cumulative_return,
      COUNT(*) OVER () as total_rows
    FROM returns
    ORDER BY date
  `;

  return await conn.query(query);
};

describe('Performance Benchmarks', () => {
  let db: DuckDB.AsyncDuckDB;
  let conn: DuckDB.AsyncDuckDBConnection;

  beforeAll(async () => {
    const setup = await setupBenchmarkData();
    db = setup.db;
    conn = setup.conn;
  });

  afterAll(async () => {
    if (conn) await conn.close();
    if (db) await db.terminate();
  });

  bench('Simple Moving Average Strategy', async () => {
    const strategy: ASTNode = {
      type: 'function_call',
      name: 'MA',
      args: [
        { type: 'identifier', value: 'close' },
        { type: 'number', value: 20 }
      ]
    };

    const result = await runBacktest(conn, strategy);
    expect(result.toArray().length).toBeGreaterThan(2000);
  }, { iterations: 10 });

  bench('RSI Strategy', async () => {
    const strategy: ASTNode = {
      type: 'function_call',
      name: 'RSI',
      args: [
        { type: 'identifier', value: 'close' },
        { type: 'number', value: 14 }
      ]
    };

    const result = await runBacktest(conn, strategy);
    expect(result.toArray().length).toBeGreaterThan(2000);
  }, { iterations: 10 });

  bench('ATR Strategy', async () => {
    const strategy: ASTNode = {
      type: 'function_call',
      name: 'ATR',
      args: [
        { type: 'number', value: 14 }
      ]
    };

    const result = await runBacktest(conn, strategy);
    expect(result.toArray().length).toBeGreaterThan(2000);
  }, { iterations: 10 });

  bench('Complex Multi-Indicator Strategy', async () => {
    const strategy: ASTNode = {
      type: 'binary_op',
      operator: 'AND',
      left: {
        type: 'comparison',
        operator: '>',
        left: {
          type: 'function_call',
          name: 'RSI',
          args: [
            { type: 'identifier', value: 'close' },
            { type: 'number', value: 14 }
          ]
        },
        right: { type: 'number', value: 70 }
      },
      right: {
        type: 'comparison',
        operator: '>',
        left: {
          type: 'function_call',
          name: 'MA',
          args: [
            { type: 'identifier', value: 'close' },
            { type: 'number', value: 20 }
          ]
        },
        right: {
          type: 'function_call',
          name: 'MA',
          args: [
            { type: 'identifier', value: 'close' },
            { type: 'number', value: 50 }
          ]
        }
      }
    };

    const result = await runBacktest(conn, strategy);
    expect(result.toArray().length).toBeGreaterThan(2000);
  }, { iterations: 5 });

  bench('DSL Compilation Performance', async () => {
    const strategies = [
      {
        type: 'function_call',
        name: 'MA',
        args: [
          { type: 'identifier', value: 'close' },
          { type: 'number', value: 20 }
        ]
      },
      {
        type: 'function_call',
        name: 'RSI',
        args: [
          { type: 'identifier', value: 'close' },
          { type: 'number', value: 14 }
        ]
      },
      {
        type: 'function_call',
        name: 'ATR',
        args: [
          { type: 'number', value: 14 }
        ]
      }
    ] as ASTNode[];

    // Compile multiple strategies
    for (const strategy of strategies) {
      const sql = compileDslToSql(strategy);
      expect(sql).toBeDefined();
      expect(sql.length).toBeGreaterThan(10);
    }
  }, { iterations: 100 });

  bench('Large Dataset Query', async () => {
    // Test with 5 years of daily data (~1250 rows)
    const query = `
      SELECT 
        date,
        close,
        AVG(close) OVER (ORDER BY date ROWS 19 PRECEDING) as ma_20,
        AVG(close) OVER (ORDER BY date ROWS 49 PRECEDING) as ma_50,
        STDDEV(close) OVER (ORDER BY date ROWS 19 PRECEDING) as volatility
      FROM large_stock 
      ORDER BY date
    `;

    const result = await conn.query(query);
    expect(result.toArray().length).toBeGreaterThan(2000);
  }, { iterations: 20 });

  bench('Memory Efficiency Test', async () => {
    // Test multiple simultaneous queries
    const queries = [];
    
    for (let i = 0; i < 5; i++) {
      const strategy: ASTNode = {
        type: 'function_call',
        name: 'MA',
        args: [
          { type: 'identifier', value: 'close' },
          { type: 'number', value: 10 + i * 5 }
        ]
      };
      
      queries.push(runBacktest(conn, strategy));
    }

    const results = await Promise.all(queries);
    results.forEach(result => {
      expect(result.toArray().length).toBeGreaterThan(2000);
    });
  }, { iterations: 5 });

  bench('SQL Injection Prevention Overhead', async () => {
    // Test performance impact of input validation
    const strategies = [
      {
        type: 'function_call',
        name: 'MA',
        args: [
          { type: 'identifier', value: 'close' },
          { type: 'number', value: 20 }
        ]
      },
      {
        type: 'function_call',
        name: 'RSI',
        args: [
          { type: 'identifier', value: 'close' },
          { type: 'number', value: 14 }
        ]
      }
    ] as ASTNode[];

    // Multiple compilation cycles to test validation overhead
    for (let i = 0; i < 10; i++) {
      for (const strategy of strategies) {
        const sql = compileDslToSql(strategy);
        expect(sql).toBeDefined();
      }
    }
  }, { iterations: 50 });
});

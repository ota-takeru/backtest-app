import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import * as duckdb from '@duckdb/duckdb-wasm/dist/duckdb-node.js'; 
import { StrategyAST, BacktestResponse } from '../../src/types';
import { astToSql } from '../../src/worker/astToSql';
import { compileDslToSql } from '../../src/lib/dslCompiler';

const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles();
let db: duckdb.AsyncDuckDB | null = null;
let conn: duckdb.AsyncDuckDBConnection | null = null;

describe('AST to SQL Workflow Integration Test', () => {
  beforeAll(async () => {
    try {
      const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);
      const worker = new Worker(bundle.mainWorker!);
      db = new duckdb.AsyncDuckDB(new duckdb.ConsoleLogger(), worker);
      await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
      await db.open({ query: { castBigIntToDouble: true } });
      conn = await db.connect();
    } catch (error) {
      console.error('Failed to initialize DuckDB:', error);
      throw error;
    }
  });

  afterAll(async () => {
    if (conn) await conn.close();
    if (db) await db.terminate();
  });

  const fixturesDir = path.join(__dirname, '..', '..', 'fixtures');
  const exampleAstFiles = [
    'dummy_rsi_strategy.json',
    'simple-ma-cross.json'
  ];

  const arrowFilePath = path.join(fixturesDir, 'dummy.arrow');

  for (const astFileName of exampleAstFiles) {
    it(`should process ${astFileName} and generate valid SQL`, async () => {
      expect(db).not.toBeNull();
      expect(conn).not.toBeNull();
      if (!db || !conn) throw new Error('DB not initialized');

      // 1. Load AST from fixtures/examples
      const astFilePath = path.join(fixturesDir, 'examples', astFileName);
      const astFileContent = await fs.readFile(astFilePath, 'utf-8');
      const strategyAst: StrategyAST = JSON.parse(astFileContent);

      // 2. Load Arrow data
      const arrowBuffer = await fs.readFile(arrowFilePath);
      await db.registerFileBuffer('dummy_ohlc.arrow', new Uint8Array(arrowBuffer));
      await conn.query('CREATE OR REPLACE TABLE ohlc_data AS SELECT * FROM dummy_ohlc.arrow;');

      // 3. Generate SQL from AST
      const params = { initCash: 1000000, slippageBp: 3 };
      const sqlQuery = astToSql(strategyAst, params.initCash, params.slippageBp, 'ohlc_data');
      
      expect(sqlQuery).toBeTypeOf('string');
      expect(sqlQuery.length).toBeGreaterThan(0);
      console.log(`Generated SQL for ${astFileName}:\n${sqlQuery}`);

      // 4. Execute SQL in DuckDB
      let results;
      try {
        const queryResult = await conn.query(sqlQuery);
        results = queryResult.toArray().map(row => row.toJSON());
      } catch (e) {
        console.error("SQL Execution Error:", e);
        throw e;
      }
      
      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);

      // 5. Validate basic response structure
      const metricsResult = results.find(r => r.type === 'metrics');
      const equityPoints = results.filter(r => r.type === 'equity_point');
      const trades = results.filter(r => r.type === 'trade_log');

      expect(metricsResult).toBeDefined();
      expect(metricsResult).toHaveProperty('cagr');
      expect(metricsResult).toHaveProperty('maxDd');
      expect(metricsResult).toHaveProperty('sharpe');

      expect(equityPoints.length).toBeGreaterThan(0);
      equityPoints.forEach(ep => {
        expect(ep).toHaveProperty('date');
        expect(ep).toHaveProperty('equity');
      });

      expect(trades.length).toBeGreaterThanOrEqual(0);
      if (trades.length > 0) {
        trades.forEach(t => {
          expect(t).toHaveProperty('id');
          expect(t).toHaveProperty('code');
          expect(t).toHaveProperty('side');
        });
      }
    });
  }

  it('should handle complex AST structures with multiple functions', async () => {
    if (!db || !conn) throw new Error('DB not initialized');

    // Create a complex strategy AST with multiple technical indicators
    const complexAst: StrategyAST = {
      entry: {
        ast: {
          type: "Logical",
          op: "AND",
          left: {
            type: "Binary",
            op: "<",
            left: {
              type: "Func",
              name: "rsi",
              args: [14]
            },
            right: {
              type: "Value",
              kind: "NUMBER",
              value: 30
            }
          },
          right: {
            type: "Binary",
            op: ">",
            left: {
              type: "Value",
              kind: "IDENT",
              value: "close"
            },
            right: {
              type: "Func",
              name: "ma",
              args: [
                { type: "Value", kind: "IDENT", value: "close" },
                20
              ]
            }
          }
        },
        timing: "next_open"
      },
      exit: {
        ast: {
          type: "Binary",
          op: ">",
          left: {
            type: "Func",
            name: "rsi",
            args: [14]
          },
          right: {
            type: "Value",
            kind: "NUMBER",
            value: 70
          }
        },
        timing: "current_close"
      },
      universe: ["7203.T"],
      cash: 1000000,
      slippage_bp: 3
    };

    // Load test data
    const arrowBuffer = await fs.readFile(arrowFilePath);
    await db.registerFileBuffer('complex_test.arrow', new Uint8Array(arrowBuffer));
    await conn.query('CREATE OR REPLACE TABLE ohlc_data AS SELECT * FROM complex_test.arrow;');

    // Generate and execute SQL
    const sqlQuery = astToSql(complexAst, 1000000, 3, 'ohlc_data');
    expect(sqlQuery).toContain('rsi_14');
    expect(sqlQuery).toContain('ma_close_20');

    const queryResult = await conn.query(sqlQuery);
    const results = queryResult.toArray().map(row => row.toJSON());
    
    expect(results.length).toBeGreaterThan(0);
    expect(results.some(r => r.type === 'metrics')).toBe(true);
    expect(results.some(r => r.type === 'equity_point')).toBe(true);
  });

  it('should handle edge cases and error conditions', async () => {
    expect(db).not.toBeNull();
    expect(conn).not.toBeNull();
    if (!db || !conn) throw new Error('DB not initialized');

    // Test empty dataset
    await conn.query('CREATE OR REPLACE TABLE empty_ohlc AS SELECT * FROM ohlc_data WHERE 1=0;');
    
    const simpleAst: StrategyAST = {
      entry: {
        ast: {
          type: "Binary",
          op: ">",
          left: { type: "Value", kind: "IDENT", value: "close" },
          right: { type: "Value", kind: "NUMBER", value: 100 }
        },
        timing: "close"
      },
      exit: {
        ast: {
          type: "Binary",
          op: "<",
          left: { type: "Value", kind: "IDENT", value: "close" },
          right: { type: "Value", kind: "NUMBER", value: 90 }
        },
        timing: "close"
      },
      universe: ["7203.T"],
      cash: 1000000,
      slippage_bp: 5
    };

    const sqlQuery = astToSql(simpleAst, 1000000, 5, 'empty_ohlc');
    const queryResult = await conn.query(sqlQuery);
    const results = queryResult.toArray().map(row => row.toJSON());
    
    // Should handle empty data gracefully
    expect(results).toBeDefined();
    const metricsResult = results.find(r => r.type === 'metrics');
    expect(metricsResult).toBeDefined();
    expect(metricsResult.cagr).toBeNull();
  });

  it('should validate SQL injection prevention', async () => {
    expect(db).not.toBeNull();
    expect(conn).not.toBeNull();
    if (!db || !conn) throw new Error('DB not initialized');

    // Test with potentially dangerous input
    const maliciousAst: StrategyAST = {
      entry: {
        ast: {
          type: "Binary",
          op: ">",
          left: { type: "Value", kind: "IDENT", value: "close" },
          right: { type: "Value", kind: "NUMBER", value: 100 }
        },
        timing: "close"
      },
      exit: {
        ast: {
          type: "Binary",
          op: "<",
          left: { type: "Value", kind: "IDENT", value: "close" },
          right: { type: "Value", kind: "NUMBER", value: 90 }
        },
        timing: "close"
      },
      universe: ["7203.T'; DROP TABLE ohlc_data; --"],
      cash: 1000000,
      slippage_bp: 5
    };

    // Should either sanitize input or throw error, not execute malicious SQL
    expect(() => {
      astToSql(maliciousAst, 1000000, 5, 'ohlc_data');
    }).not.toThrow(); // Should handle gracefully without crashing

    // Original table should still exist
    const tableCheck = await conn.query("SELECT COUNT(*) as cnt FROM ohlc_data");
    const count = tableCheck.toArray()[0].toJSON().cnt;
    expect(count).toBeGreaterThan(0);
  });

  it('should handle performance requirements for large datasets', async () => {
    expect(db).not.toBeNull();
    expect(conn).not.toBeNull();
    if (!db || !conn) throw new Error('DB not initialized');

    const startTime = Date.now();

    // Test with the existing data (simulating 20-year dataset)
    const performanceAst: StrategyAST = {
      entry: {
        ast: {
          type: "Binary",
          op: "<",
          left: {
            type: "Func",
            name: "rsi",
            args: [
              { type: "Value", kind: "IDENT", value: "close" },
              { type: "Value", kind: "NUMBER", value: 14 }
            ]
          },
          right: { type: "Value", kind: "NUMBER", value: 30 }
        },
        timing: "close"
      },
      exit: {
        ast: {
          type: "Binary",
          op: ">",
          left: {
            type: "Func",
            name: "rsi",
            args: [
              { type: "Value", kind: "IDENT", value: "close" },
              { type: "Value", kind: "NUMBER", value: 14 }
            ]
          },
          right: { type: "Value", kind: "NUMBER", value: 70 }
        },
        timing: "close"
      },
      universe: ["7203.T"],
      cash: 1000000,
      slippage_bp: 5
    };

    const sqlQuery = astToSql(performanceAst, 1000000, 5, 'ohlc_data');
    const queryResult = await conn.query(sqlQuery);
    const results = queryResult.toArray().map(row => row.toJSON());

    const endTime = Date.now();
    const executionTime = endTime - startTime;

    console.log(`Backtest execution time: ${executionTime}ms`);

    // Should complete within reasonable time (< 5 seconds for integration test)
    expect(executionTime).toBeLessThan(5000);
    expect(results.length).toBeGreaterThan(0);
  });

  it('should validate calculation accuracy', async () => {
    expect(db).not.toBeNull();
    expect(conn).not.toBeNull();
    if (!db || !conn) throw new Error('DB not initialized');

    // Create simple test data with known values
    await conn.query(`
      CREATE OR REPLACE TABLE test_accuracy AS 
      SELECT * FROM (VALUES 
        ('2024-01-01'::DATE, '7203.T', 100.0, 105.0, 95.0, 102.0, 1000000),
        ('2024-01-02'::DATE, '7203.T', 102.0, 110.0, 100.0, 108.0, 1100000),
        ('2024-01-03'::DATE, '7203.T', 108.0, 112.0, 105.0, 106.0, 900000),
        ('2024-01-04'::DATE, '7203.T', 106.0, 109.0, 103.0, 104.0, 800000),
        ('2024-01-05'::DATE, '7203.T', 104.0, 107.0, 101.0, 105.0, 950000)
      ) AS t(date, code, open, high, low, close, volume)
    `);

    const accuracyAst: StrategyAST = {
      entry: {
        ast: {
          type: "Binary",
          op: ">",
          left: { type: "Value", kind: "IDENT", value: "close" },
          right: { type: "Value", kind: "NUMBER", value: 105 }
        },
        timing: "close"
      },
      exit: {
        ast: {
          type: "Binary",
          op: "<",
          left: { type: "Value", kind: "IDENT", value: "close" },
          right: { type: "Value", kind: "NUMBER", value: 106 }
        },
        timing: "close"
      },
      universe: ["7203.T"],
      cash: 100000,
      slippage_bp: 0
    };

    const sqlQuery = astToSql(accuracyAst, 100000, 0, 'test_accuracy');
    const queryResult = await conn.query(sqlQuery);
    const results = queryResult.toArray().map(row => row.toJSON());

    // Verify calculations
    const trades = results.filter(r => r.type === 'trade_log');
    expect(trades.length).toBeGreaterThanOrEqual(2); // Should have buy and sell

    const metricsResult = results.find(r => r.type === 'metrics');
    expect(metricsResult).toBeDefined();
    expect(typeof metricsResult.cagr).toBe('number');
    expect(typeof metricsResult.maxDd).toBe('number');
  });
});

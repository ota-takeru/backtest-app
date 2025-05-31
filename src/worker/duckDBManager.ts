/**
 * DuckDB管理クラス
 * DuckDBの初期化、接続管理、基本操作を担当
 */

import * as duckdb from "@duckdb/duckdb-wasm";
import { WorkerLogger } from "./logger";
import { ErrorHandler, ErrorFactory, WorkerError } from "./errorHandler";
import { DuckDBConfig } from "./config";

export class DuckDBManager {
  private mainBundle: duckdb.DuckDBBundle | null = null;
  private db: duckdb.AsyncDuckDB | null = null;
  private logger: WorkerLogger;
  private errorHandler: ErrorHandler;

  constructor(
    private config: DuckDBConfig,
    parentLogger: WorkerLogger,
    errorHandler: ErrorHandler
  ) {
    this.logger = parentLogger.createChildLogger("DuckDB");
    this.errorHandler = errorHandler;
  }

  async initialize(): Promise<void> {
    try {
      this.logger.info("Initializing DuckDB...");

      if (!this.mainBundle) {
        this.logger.info("Loading DuckDB bundle...");
        this.mainBundle = await duckdb.selectBundle(duckdb.getJsDelivrBundles());
        this.logger.info("Bundle loaded successfully");
      }

      if (!this.db) {
        this.logger.info("Creating DuckDB worker...");
        const worker = await duckdb.createWorker(this.mainBundle!.mainWorker!);
        this.db = new duckdb.AsyncDuckDB(new duckdb.ConsoleLogger(), worker);
        
        await this.db.instantiate(this.mainBundle!.mainModule, this.mainBundle!.pthreadWorker);
        await this.db.open({ query: this.config.queryConfig });
        
        this.logger.info("DuckDB-WASM initialized successfully");
      }
    } catch (error) {
      throw this.errorHandler.createError(
        ErrorFactory.databaseInitialization("初期化に失敗しました", error as Error)
      );
    }
  }

  async createConnection(): Promise<duckdb.AsyncDuckDBConnection> {
    if (!this.db) {
      throw this.errorHandler.createError(
        ErrorFactory.databaseInitialization("データベースが初期化されていません")
      );
    }

    try {
      const conn = await this.db.connect();
      this.logger.info("DuckDB connection established");
      return conn;
    } catch (error) {
      throw this.errorHandler.createError(
        ErrorFactory.databaseInitialization("接続の作成に失敗しました", error as Error)
      );
    }
  }

  async testCapabilities(conn: duckdb.AsyncDuckDBConnection): Promise<void> {
    try {
      this.logger.info("Testing DuckDB capabilities...");
      
      // バージョン確認
      const versionQuery = await conn.query("SELECT version();");
      const versionResult = versionQuery.toArray();
      this.logger.info("DuckDB version", versionResult[0]?.toJSON());

      // 利用可能な関数を確認
      const functionsQuery = await conn.query(
        `SELECT function_name FROM duckdb_functions() 
         WHERE function_name LIKE '%arrow%' OR function_name LIKE '%ipc%' OR function_name LIKE '%read%' 
         LIMIT 20;`
      );
      const functions = functionsQuery.toArray();
      this.logger.debug(
        "Available functions",
        functions.map((f) => f.toJSON())
      );
    } catch (error) {
      this.logger.warn("DuckDB capabilities test failed", (error as Error).message);
    }
  }

  async registerFileBuffer(fileName: string, buffer: Uint8Array): Promise<void> {
    if (!this.db) {
      throw this.errorHandler.createError(
        ErrorFactory.databaseInitialization("データベースが初期化されていません")
      );
    }

    try {
      await this.db.registerFileBuffer(fileName, buffer);
      this.logger.info(`File registered: ${fileName}`);
    } catch (error) {
      throw this.errorHandler.createError(
        ErrorFactory.dataRegistration(
          `ファイル登録に失敗しました: ${fileName}`,
          error as Error
        )
      );
    }
  }

  async executeQuery(conn: duckdb.AsyncDuckDBConnection, sql: string): Promise<any[]> {
    try {
      this.logger.debug("Executing SQL", { sql: sql.substring(0, 200) + "..." });
      const queryResult = await conn.query(sql);
      const results = queryResult.toArray().map((row) => row.toJSON());
      this.logger.info(`Query executed successfully, ${results.length} rows returned`);
      return results;
    } catch (error) {
      throw this.errorHandler.createError(
        ErrorFactory.sqlExecution((error as Error).message, error as Error)
      );
    }
  }

  async cleanup(): Promise<void> {
    if (this.db) {
      try {
        // Note: DuckDB-WASM doesn't have explicit cleanup methods
        this.logger.info("DuckDB cleanup completed");
      } catch (error) {
        this.logger.warn("Error during DuckDB cleanup", (error as Error).message);
      }
    }
  }
}

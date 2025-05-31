/**
 * Arrowデータローダークラス
 * 複数の手法でArrowデータをDuckDBに読み込む処理を管理
 */

import * as duckdb from "@duckdb/duckdb-wasm";
import { WorkerLogger } from "./logger";
import { ErrorHandler, ErrorFactory } from "./errorHandler";
import { ArrowConfig } from "./config";
import { DuckDBManager } from "./duckDBManager";

export interface ArrowLoadResult {
  success: boolean;
  method: string;
  rowCount?: number;
  tableStructure?: any[];
}

export class ArrowDataLoader {
  private logger: WorkerLogger;
  private errorHandler: ErrorHandler;

  constructor(
    private config: ArrowConfig,
    private duckDBManager: DuckDBManager,
    parentLogger: WorkerLogger,
    errorHandler: ErrorHandler
  ) {
    this.logger = parentLogger.createChildLogger("ArrowLoader");
    this.errorHandler = errorHandler;
  }

  async loadArrowData(
    conn: duckdb.AsyncDuckDBConnection,
    arrowBuffer: Uint8Array,
    tableName: string = "ohlc_data"
  ): Promise<ArrowLoadResult> {
    this.logger.info("Starting Arrow data loading", {
      bufferSize: arrowBuffer.byteLength,
      tableName,
    });

    // Buffer情報をログ出力
    if (this.config.supportedMethods.length > 0) {
      this.logArrowBufferInfo(arrowBuffer);
    }

    // Apache Arrowライブラリでバッファの内容を事前確認
    await this.validateArrowBuffer(arrowBuffer);

    // 複数の手法を順番に試行
    for (const method of this.config.supportedMethods) {
      try {
        this.logger.info(`Trying method: ${method}`);
        const result = await this.tryLoadMethod(conn, arrowBuffer, tableName, method);
        if (result.success) {
          this.logger.info(`Successfully loaded data using method: ${method}`);
          return result;
        }
      } catch (error) {
        this.logger.warn(`Method ${method} failed`, (error as Error).message);
        continue;
      }
    }

    throw this.errorHandler.createError(
      ErrorFactory.dataRegistration("すべてのArrowデータ読み込み方法が失敗しました")
    );
  }

  private logArrowBufferInfo(arrowBuffer: Uint8Array): void {
    this.logger.debug("Arrow buffer info", {
      size: arrowBuffer.byteLength,
      firstBytes: Array.from(arrowBuffer.slice(0, 100))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join(" "),
    });
  }

  private async validateArrowBuffer(arrowBuffer: Uint8Array): Promise<void> {
    try {
      const arrow = await import("apache-arrow");
      const table = arrow.tableFromIPC(arrowBuffer);
      
      this.logger.info("Arrow table validation", {
        schema: table.schema.fields.map((f) => ({
          name: f.name,
          type: f.type.toString(),
        })),
        numRows: table.numRows,
        numCols: table.numCols,
        sampleRow: table.numRows > 0 ? table.get(0) : null,
      });
    } catch (error) {
      this.logger.warn("Arrow buffer validation failed", (error as Error).message);
    }
  }

  private async tryLoadMethod(
    conn: duckdb.AsyncDuckDBConnection,
    arrowBuffer: Uint8Array,
    tableName: string,
    method: string
  ): Promise<ArrowLoadResult> {
    switch (method) {
      case "manual_table_creation":
        return await this.loadViaManualTableCreation(conn, arrowBuffer, tableName);
      case "insertArrowFromIPCStream":
        return await this.loadViaInsertArrowFromIPCStream(conn, arrowBuffer, tableName);
      case "file_registration_read_arrow":
        return await this.loadViaFileRegistration(conn, arrowBuffer, tableName, "read_arrow");
      case "file_registration_arrow_scan":
        return await this.loadViaFileRegistration(conn, arrowBuffer, tableName, "arrow_scan");
      case "file_registration_parquet":
        return await this.loadViaFileRegistration(conn, arrowBuffer, tableName, "read_parquet");
      default:
        throw new Error(`Unknown load method: ${method}`);
    }
  }

  private async loadViaManualTableCreation(
    conn: duckdb.AsyncDuckDBConnection,
    arrowBuffer: Uint8Array,
    tableName: string
  ): Promise<ArrowLoadResult> {
    const arrow = await import("apache-arrow");
    const table = arrow.tableFromIPC(arrowBuffer);

    // テーブルスキーマから手動でCREATE TABLE文を生成
    const fields = table.schema.fields;
    const columnDefs = fields
      .map((field) => {
        let sqlType = "VARCHAR";
        const arrowType = field.type.toString().toLowerCase();

        if (arrowType.includes("int") || arrowType.includes("bigint")) {
          sqlType = "BIGINT";
        } else if (arrowType.includes("float") || arrowType.includes("double")) {
          sqlType = "DOUBLE";
        } else if (arrowType.includes("date") || arrowType.includes("timestamp")) {
          sqlType = "DATE";
        }

        return `"${field.name}" ${sqlType}`;
      })
      .join(", ");

    const createTableSQL = `CREATE OR REPLACE TABLE ${tableName} (${columnDefs});`;
    await this.duckDBManager.executeQuery(conn, createTableSQL);

    // データを行ごとに挿入（テスト用に制限）
    const numRows = Math.min(table.numRows, this.config.maxTestRows);
    const insertValues: string[] = [];

    for (let i = 0; i < numRows; i++) {
      const row = table.get(i);
      const values = fields.map((field) => {
        const value = (row as any)[field.name];
        if (value === null || value === undefined) {
          return "NULL";
        } else if (typeof value === "string") {
          return `'${value.replace(/'/g, "''")}'`;
        } else {
          return String(value);
        }
      });
      insertValues.push(`(${values.join(", ")})`);
    }

    if (insertValues.length > 0) {
      const bulkInsertSQL = `INSERT INTO ${tableName} VALUES ${insertValues.join(", ")}`;
      await this.duckDBManager.executeQuery(conn, bulkInsertSQL);
    }

    return {
      success: true,
      method: "manual_table_creation",
      rowCount: insertValues.length,
    };
  }

  private async loadViaInsertArrowFromIPCStream(
    conn: duckdb.AsyncDuckDBConnection,
    arrowBuffer: Uint8Array,
    tableName: string
  ): Promise<ArrowLoadResult> {
    await conn.insertArrowFromIPCStream(arrowBuffer, {
      name: tableName,
      create: true,
    });

    // テーブルの存在確認
    await this.duckDBManager.executeQuery(conn, `SELECT COUNT(*) FROM ${tableName};`);

    return {
      success: true,
      method: "insertArrowFromIPCStream",
    };
  }

  private async loadViaFileRegistration(
    conn: duckdb.AsyncDuckDBConnection,
    arrowBuffer: Uint8Array,
    tableName: string,
    readFunction: string
  ): Promise<ArrowLoadResult> {
    const fileName = "input_arrow.arrow";
    await this.duckDBManager.registerFileBuffer(fileName, arrowBuffer);

    const createTableSQL = `CREATE OR REPLACE TABLE ${tableName} AS SELECT * FROM ${readFunction}('${fileName}');`;
    await this.duckDBManager.executeQuery(conn, createTableSQL);

    return {
      success: true,
      method: `file_registration_${readFunction}`,
    };
  }

  async verifyTable(
    conn: duckdb.AsyncDuckDBConnection,
    tableName: string = "ohlc_data"
  ): Promise<{
    exists: boolean;
    rowCount?: number;
    structure?: any[];
  }> {
    try {
      // テーブル一覧を確認
      const tablesQuery = await this.duckDBManager.executeQuery(conn, "SHOW TABLES;");
      this.logger.debug("Available tables", tablesQuery);

      // 指定されたテーブルが存在するかチェック
      const tableExists = tablesQuery.some((table: any) => {
        return table.name === tableName || table.table_name === tableName;
      });

      if (!tableExists) {
        // 最初に見つかったテーブルをエイリアスとして使用
        if (tablesQuery.length > 0) {
          const firstTable = tablesQuery[0];
          const firstTableName = firstTable.name || firstTable.table_name;
          this.logger.info(`Creating view ${tableName} from ${firstTableName}`);
          
          const createViewSQL = `CREATE OR REPLACE VIEW ${tableName} AS SELECT * FROM "${firstTableName}";`;
          await this.duckDBManager.executeQuery(conn, createViewSQL);
        } else {
          return { exists: false };
        }
      }

      // 行数とテーブル構造を確認
      const countResult = await this.duckDBManager.executeQuery(
        conn,
        `SELECT COUNT(*) as count FROM ${tableName} LIMIT 1;`
      );
      const structResult = await this.duckDBManager.executeQuery(
        conn,
        `DESCRIBE ${tableName};`
      );

      this.logger.info("Table verification completed", {
        tableName,
        rowCount: countResult[0]?.count,
        columns: structResult.length,
      });

      return {
        exists: true,
        rowCount: countResult[0]?.count,
        structure: structResult,
      };
    } catch (error) {
      this.logger.error("Table verification failed", (error as Error).message);
      throw this.errorHandler.createError(
        ErrorFactory.dataRegistration(
          `テーブル ${tableName} の検証に失敗しました: ${(error as Error).message}`
        )
      );
    }
  }
}

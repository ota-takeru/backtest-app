/**
 * エラーハンドリング統一システム
 * Worker内で発生するエラーを管理し、一貫したエラーレスポンスを提供
 */

import { WorkerErrorMessage } from "../types";
import { WorkerLogger } from "./logger";

export enum ErrorCode {
  // データ関連エラー (E3xxx)
  E3001 = "E3001", // Worker内部エラー/データベース初期化エラー
  E3002 = "E3002", // データ登録エラー

  // 戦略関連エラー (E1xxx)
  E1002 = "E1002", // AST→SQL変換エラー

  // 汎用エラー
  E9999 = "E9999", // テスト用/予期しないエラー
}

export interface ErrorDetails {
  code: ErrorCode;
  message: string;
  originalError?: Error;
  context?: string;
  details?: any;
}

export class WorkerError extends Error {
  public readonly code: ErrorCode;
  public readonly originalError?: Error;
  public readonly context?: string;
  public readonly details?: any;

  constructor(errorDetails: ErrorDetails) {
    super(errorDetails.message);
    this.name = "WorkerError";
    this.code = errorDetails.code;
    this.originalError = errorDetails.originalError;
    this.context = errorDetails.context;
    this.details = errorDetails.details;
  }

  toWorkerMessage(req_id: string): WorkerErrorMessage {
    return {
      type: "error",
      req_id,
      message: `${this.code}: ${this.message}${
        this.details ? ` - ${JSON.stringify(this.details)}` : ""
      }`,
    };
  }
}

export class ErrorHandler {
  constructor(private logger: WorkerLogger) {}

  createError(errorDetails: ErrorDetails): WorkerError {
    const error = new WorkerError(errorDetails);
    this.logger.error(`${error.code}: ${error.message}`, {
      context: error.context,
      details: error.details,
      originalError: error.originalError?.message,
    });
    return error;
  }

  handleError(
    error: unknown,
    context: string,
    defaultCode: ErrorCode = ErrorCode.E3001
  ): WorkerError {
    if (error instanceof WorkerError) {
      return error;
    }

    const errorMessage = error instanceof Error ? error.message : String(error);

    return this.createError({
      code: defaultCode,
      message: errorMessage,
      originalError: error instanceof Error ? error : undefined,
      context,
    });
  }

  postError(
    req_id: string,
    error: WorkerError | ErrorDetails,
    postMessage: (message: WorkerErrorMessage) => void
  ): void {
    const workerError =
      error instanceof WorkerError ? error : this.createError(error);

    postMessage(workerError.toWorkerMessage(req_id));
  }
}

// 事前定義されたエラーファクトリー関数
export const ErrorFactory = {
  databaseInitialization: (
    message: string,
    originalError?: Error
  ): ErrorDetails => ({
    code: ErrorCode.E3001,
    message: `DuckDB初期化エラー: ${message}`,
    originalError,
    context: "DB_INIT",
  }),

  dataRegistration: (message: string, originalError?: Error): ErrorDetails => ({
    code: ErrorCode.E3002,
    message: `Arrowデータ登録エラー: ${message}`,
    originalError,
    context: "DATA_REGISTRATION",
  }),

  astToSqlConversion: (message: string, details?: any): ErrorDetails => ({
    code: ErrorCode.E1002,
    message: `戦略のSQL変換エラー: ${message}`,
    details,
    context: "AST_TO_SQL",
  }),

  sqlExecution: (message: string, originalError?: Error): ErrorDetails => ({
    code: ErrorCode.E3001,
    message: `SQLクエリ実行エラー: ${message}`,
    originalError,
    context: "SQL_EXECUTION",
  }),

  resultProcessing: (message: string, originalError?: Error): ErrorDetails => ({
    code: ErrorCode.E3001,
    message: `結果データ処理エラー: ${message}`,
    originalError,
    context: "RESULT_PROCESSING",
  }),

  missingInput: (inputName: string): ErrorDetails => ({
    code: ErrorCode.E3001,
    message: `必須入力が不足しています: ${inputName}`,
    context: "INPUT_VALIDATION",
  }),
};

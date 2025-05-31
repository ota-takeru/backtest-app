/* eslint-disable @typescript-eslint/consistent-type-definitions */

import { StrategyAST } from "../types";

// REQUIREMENTS.md §3.1 JSON Schema を参照
export interface StrategyDSL {
  // meta, data_source は REQUIREMENTS.md に明記されていないが、既存のものを一旦残す
  meta?: {
    // オプショナルに変更
    dsl_version: "1.0";
    created_at: string; // ISO8601
  };
  data_source?: "jquants_v1"; // オプショナルに変更

  entry: {
    condition: string; // BOOL_EXPR
    timing: "next_open" | "close"; // 変更
  };
  exit: {
    condition: string; // BOOL_EXPR (必須)
    timing: "current_close"; // REQUIREMENTS.md §3.1 に基づき追加
  };
  universe: string[]; // pattern: "^[0-9]{4}\\.T$" は型では表現しきれないのでコメントで補足
  cash?: number; // default: 1000000 (integer)
  slippage_bp?: number; // default: 3 (number)

  // 以下のプロパティは REQUIREMENTS.md のDSLスキーマにないため削除
  // stop_loss: {
  //   type: "percent" | "value";
  //   value: number;
  // } | null;
  // take_profit?: unknown | null;
  // position: {
  //   size_type: "all_cash" | "fixed" | "percent";
  //   value: number | null;
  // };
  // indicators: Record<string, number[]>;
}

export interface OHLCFrameJSON {
  // これは変更なし (Arrow変換前の一時的な形式として使用する可能性あり)
  code: string;
  columns: string[]; // e.g., ["Date", "Open", "High", "Low", "Close", "Volume"]
  index: string[]; // ISO8601 date strings
  data: (number | null)[][]; // Volumeがnullになるケースを考慮
}

// REQUIREMENTS.md §5 を参照
export interface BacktestRequest {
  req_id: string; // Workerとの通信でリクエストとレスポンスを紐付けるID
  dsl_ast: StrategyAST; // JSON-AST-DSL (changed from sql to dsl_ast)
  arrow: Uint8Array; // Arrow IPC形式のテーブル: ohlc (date, open, ...)
  params: {
    initCash: number;
    slippageBp: number;
  };
}

// REQUIREMENTS.md §5 を参照
// export interface TradeRow { /* 詳細な取引情報をここに定義 */ } // TODO: 具体的なTradeRowの型定義
export type TradeRow = any; // 一旦anyで

export interface BacktestResponse {
  req_id: string; // 対応するリクエストID
  metrics: {
    cagr: number;
    maxDd: number; // Max Drawdown
    sharpe: number; // Sharpe Ratio
    // Trades は削除
  };
  equityCurve: {
    date: string; // ISO-8601
    equity: number;
  }[];
  trades: TradeRow[]; // 詳細なフィル情報、1行が1トレードに対応
  warnings?: string[]; // REQUIREMENTS.md にはないが、エラー以外の警告通知用として便利なのでオプショナルで残す
}

export interface ProgressMessage {
  type: "progress";
  req_id?: string;
  progress: number;
  message: string;
}

// Workerからのメッセージ型: 正常終了時のレスポンス、エラー、または進捗
export type WorkerMessage =
  | (BacktestResponse & { type: "result" }) // 正常終了
  | { type: "error"; req_id?: string; message: string } // エラー発生
  | ProgressMessage; // 進捗

export type ErrorCode = "E1001" | "E1002" | "E2001" | "E3001" | "E3002"; // E3002 を追加

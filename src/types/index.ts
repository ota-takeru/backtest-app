export type LogicalOperator = "AND" | "OR";
export type BinaryOperator = ">" | "<" | ">=" | "<=" | "==" | "!=";
export type FunctionName =
  | "ma"
  | "rsi"
  | "atr"
  | "lag"
  | "shift"
  | "stop_high"
  | "stop_low";
export type ValueKind = "IDENT" | "NUMBER";
export type IdentifierValue =
  | "price"
  | "entry_price"
  | "high"
  | "low"
  | "close"
  | "volume"
  | "open";

export interface BaseNode {
  type: string;
}

export interface LogicalNode extends BaseNode {
  type: "Logical";
  op: LogicalOperator;
  left: AnyNode;
  right: AnyNode;
}

export interface BinaryNode extends BaseNode {
  type: "Binary";
  op: BinaryOperator;
  left: AnyNode;
  right: AnyNode;
}

export interface FuncNode extends BaseNode {
  type: "Func";
  name: FunctionName;
  args: (number | ValueNode)[];
}

export interface ValueNode extends BaseNode {
  type: "Value";
  kind: ValueKind;
  value: IdentifierValue | number;
}

export type AnyNode = LogicalNode | BinaryNode | FuncNode | ValueNode;

export type Timing = "next_open" | "close" | "current_close";

export interface StrategyRule {
  ast: AnyNode;
  timing: Timing;
}

export interface StrategyAST {
  entry: StrategyRule;
  exit: StrategyRule;
  universe: string[];
  cash?: number;
  slippage_bp?: number;
}

export interface TradeRow {
  id: number; // 連番 (1~)
  code: string; // '7203.T'
  side: "long"; // MVP は long 固定
  entryDate: string; // ISO-8601 (YYYY-MM-DD)
  exitDate: string; // ISO-8601
  qty: number; // 株数 (整数)
  entryPx: number; // 円
  exitPx: number; // 円
  slippageBp: number; // 片道 bps (entry と exit 同一)
  pnl: number; // 円 (手数料・スリッページ込)
  pnlPct: number; // (exitPx-entryPx)/entryPx
  duration: number; // 日数 (= exitDate-entryDate)
}

export interface BacktestRequest {
  req_id: string; // UUIDv4
  dsl_ast: StrategyAST;
  arrow: Uint8Array;
  params: {
    initCash: number;
    slippageBp: number;
  };
}

export interface BacktestResponse {
  req_id: string;
  metrics: {
    cagr: number | null;
    maxDd: number | null;
    sharpe: number | null;
  } | null;
  equityCurve: { date: string; equity: number }[];
  trades: TradeRow[];
  warnings?: string[];
}

// Workerとのメッセージ型定義
export type WorkerProgressMessage = {
  type: "progress";
  req_id: string;
  progress?: number;
  message?: string;
};

export type WorkerResultMessage = {
  type: "result";
  req_id: string;
  metrics: BacktestResponse["metrics"];
  equityCurve: BacktestResponse["equityCurve"];
  trades: BacktestResponse["trades"];
  warnings?: string[];
};

export type WorkerErrorMessage = {
  type: "error";
  req_id: string;
  message: string;
};

export type WorkerMessage =
  | WorkerProgressMessage
  | WorkerResultMessage
  | WorkerErrorMessage;

import { z } from "zod";

export const StrategyDSLEntrySchema = z.object({
  condition: z.string().describe("BOOL_EXPR"),
  timing: z.enum(["next_open", "close"]),
});
export type StrategyDSLEntry = z.infer<typeof StrategyDSLEntrySchema>;

export const StrategyDSLExitSchema = z.object({
  condition: z.string().describe("BOOL_EXPR"),
  timing: z.enum(["current_close"]),
});
export type StrategyDSLExit = z.infer<typeof StrategyDSLExitSchema>;

export const StrategyDSLSchema = z.object({
  entry: StrategyDSLEntrySchema,
  exit: StrategyDSLExitSchema,
  universe: z.array(z.string().regex(/^[0-9]{4}\\.T$/)).min(1),
  cash: z.number().int().default(1000000).optional(),
  slippage_bp: z.number().default(3).optional(),
});
export type StrategyDSL = z.infer<typeof StrategyDSLSchema>;

// BOOL_EXPR のための基本的な型定義 (今後パーサー実装時に詳細化)
export const TermSchema = z.union([
  z.string(), // IDENT (price, entry_price, etc.) or FUNC (ma(10), rsi(14))
  z.number(), // NUMBER
]);
export type Term = z.infer<typeof TermSchema>;

export const ComparisonOperatorSchema = z.enum([
  ">",
  "<",
  ">=",
  "<=",
  "==",
  "!=",
]);
export type ComparisonOperator = z.infer<typeof ComparisonOperatorSchema>;

export const CompareSchema = z.object({
  left: TermSchema,
  operator: ComparisonOperatorSchema,
  right: TermSchema,
});
export type Compare = z.infer<typeof CompareSchema>;

export const LogicalOperatorSchema = z.enum(["&&", "||"]);
export type LogicalOperator = z.infer<typeof LogicalOperatorSchema>;

// 論理演算ノードの型エイリアス
export interface LogicalOperationNode {
  left: BoolExprASTNode; // 再帰的な参照
  operator: LogicalOperator;
  right: BoolExprASTNode; // 再帰的な参照
}

// これはあくまで DSL の condition 文字列をパースした後の表現のイメージです。
// 実際の BOOL_EXPR パーサーは文字列からこの構造を生成します。
export type BoolExprASTNode =
  | z.infer<typeof CompareSchema>
  | LogicalOperationNode; // 以前の匿名オブジェクトを型エイリアスで置き換え

export const BoolExprASTNodeSchema: z.ZodType<BoolExprASTNode> = z.union([
  CompareSchema,
  z
    .object({
      left: z.lazy(() => BoolExprASTNodeSchema),
      operator: LogicalOperatorSchema,
      right: z.lazy(() => BoolExprASTNodeSchema),
    })
    .transform((val) => val as LogicalOperationNode), // Zodスキーマも対応する型に合わせる
]);

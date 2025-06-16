import { z } from "zod";
import { StrategyAST, FunctionName, IdentifierValue } from "../types";

// AST ノードの型定義
const ValueNodeSchema = z.object({
  type: z.literal("Value"),
  kind: z.enum(["IDENT", "NUMBER"]),
  value: z.union([
    z.enum([
      "price",
      "entry_price",
      "high",
      "low",
      "close",
      "volume",
      "open",
    ]),
    z.number(),
  ]),
});

const FuncNodeSchema = z.object({
  type: z.literal("Func"),
  name: z.enum(["ma", "rsi", "atr"]),
  args: z
    .array(z.union([z.number(), ValueNodeSchema]))
    .min(1)
    .max(2),
});

const AnyNodeSchema: z.ZodType<any> = z.lazy(() =>
  z.union([
    z.object({
      type: z.literal("Logical"),
      op: z.enum(["AND", "OR"]),
      left: AnyNodeSchema,
      right: AnyNodeSchema,
    }),
    z.object({
      type: z.literal("Binary"),
      op: z.enum([">", "<", ">=", "<=", "==", "!="]),
      left: AnyNodeSchema,
      right: AnyNodeSchema,
    }),
    FuncNodeSchema,
    ValueNodeSchema,
  ])
);

// Strategy全体のスキーマ
const StrategyASTSchema = z.object({
  entry: z.object({
    ast: AnyNodeSchema,
    timing: z.enum(["next_open", "close"]),
  }),
  exit: z.object({
    ast: AnyNodeSchema,
    timing: z.enum(["current_close"]),
  }),
  universe: z.array(z.string().regex(/^[0-9]{4}\.T$/)).min(1),
  cash: z.number().int().optional(),
  slippage_bp: z.number().optional(),
});

export type ValidationResult =
  | { success: true; data: StrategyAST }
  | { success: false; error: z.ZodError; errorCode: "E1001" };

/**
 * StrategyAST オブジェクトを Zod スキーマでバリデーションする
 * @param ast - 検証するASTオブジェクト
 * @returns バリデーション結果 (成功時はパースされたデータ、失敗時はZodErrorとエラーコード)
 */
export function validateAst(ast: unknown): ValidationResult {
  const result = StrategyASTSchema.safeParse(ast);
  if (result.success) {
    return { success: true, data: result.data };
  } else {
    return { success: false, error: result.error, errorCode: "E1001" };
  }
}

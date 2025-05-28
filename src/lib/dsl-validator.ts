import { StrategyDSL, StrategyDSLSchema } from "../types/dsl";
import { z } from "zod";

export type ValidationResult =
  | { success: true; data: StrategyDSL }
  | { success: false; error: z.ZodError; errorCode: "E1001" }; // E1002はコンパイラが担当

/**
 * StrategyDSL オブジェクトを Zod スキーマでバリデーションする
 * @param dsl - 検証するDSLオブジェクト
 * @returns バリデーション結果 (成功時はパースされたデータ、失敗時はZodErrorとエラーコード)
 */
export function validateDsl(dsl: unknown): ValidationResult {
  const result = StrategyDSLSchema.safeParse(dsl);
  if (result.success) {
    return { success: true, data: result.data };
  } else {
    // REQUIREMENTS.md §8 より、Zodバリデーションエラーは E1001 とする
    return { success: false, error: result.error, errorCode: "E1001" };
  }
}

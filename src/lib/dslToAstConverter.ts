/**
 * StrategyDSLをStrategyASTに変換するコンバーター
 * UIから受け取った古いDSL形式を新しいAST形式に変換する
 */

import { StrategyDSL } from "./types";
import { StrategyAST, AnyNode } from "../types";

export class DslConversionError extends Error {
  constructor(message: string, public details?: any) {
    super(message);
    this.name = "DslConversionError";
  }
}

/**
 * 単純な条件文字列をASTノードに変換
 * 例: "rsi(14) < 30" -> Binary node
 * 注意: これは非常に単純な実装で、実際のプロダクションでは完全なパーサーが必要
 */
function parseConditionToAst(condition: string): AnyNode {
  // 非常に基本的なパーサー - 実際の実装ではより堅牢なパーサーが必要
  condition = condition.trim();

  // RSI関数のパターン
  const rsiMatch = condition.match(
    /rsi\((\d+)\)\s*([<>=!]+)\s*(\d+(?:\.\d+)?)/
  );
  if (rsiMatch) {
    const [, period, operator, value] = rsiMatch;
    return {
      type: "Binary",
      op: operator as ">=" | "<=" | "==" | "!=" | ">" | "<",
      left: {
        type: "Func",
        name: "rsi",
        args: [parseInt(period)],
      },
      right: {
        type: "Value",
        kind: "NUMBER",
        value: parseFloat(value),
      },
    };
  }

  // MA関数のパターン
  const maMatch = condition.match(/ma\((\d+)\)\s*([<>=!]+)\s*ma\((\d+)\)/);
  if (maMatch) {
    const [, period1, operator, period2] = maMatch;
    return {
      type: "Binary",
      op: operator as ">=" | "<=" | "==" | "!=" | ">" | "<",
      left: {
        type: "Func",
        name: "ma",
        args: [
          { type: "Value", kind: "IDENT", value: "close" },
          parseInt(period1),
        ],
      },
      right: {
        type: "Func",
        name: "ma",
        args: [
          { type: "Value", kind: "IDENT", value: "close" },
          parseInt(period2),
        ],
      },
    };
  }

  // 単純なma(period) > ma(period2)パターン
  const maCrossMatch = condition.match(
    /ma\((\d+)\)\s*([<>=!]+)\s*(\d+(?:\.\d+)?)/
  );
  if (maCrossMatch) {
    const [, period, operator, value] = maCrossMatch;
    return {
      type: "Binary",
      op: operator as ">=" | "<=" | "==" | "!=" | ">" | "<",
      left: {
        type: "Func",
        name: "ma",
        args: [
          { type: "Value", kind: "IDENT", value: "close" },
          parseInt(period),
        ],
      },
      right: {
        type: "Value",
        kind: "NUMBER",
        value: parseFloat(value),
      },
    };
  }

  // close > 100 のような単純なパターン
  const simpleMatch = condition.match(
    /(close|high|low|open|volume)\s*([<>=!]+)\s*(\d+(?:\.\d+)?)/
  );
  if (simpleMatch) {
    const [, field, operator, value] = simpleMatch;
    return {
      type: "Binary",
      op: operator as ">=" | "<=" | "==" | "!=" | ">" | "<",
      left: {
        type: "Value",
        kind: "IDENT",
        value: field as "close" | "high" | "low" | "volume",
      },
      right: {
        type: "Value",
        kind: "NUMBER",
        value: parseFloat(value),
      },
    };
  }

  // ANDやORを含む複合条件の処理
  if (condition.includes(" AND ")) {
    const parts = condition.split(" AND ");
    if (parts.length === 2) {
      return {
        type: "Logical",
        op: "AND",
        left: parseConditionToAst(parts[0].trim()),
        right: parseConditionToAst(parts[1].trim()),
      };
    }
  }

  if (condition.includes(" OR ")) {
    const parts = condition.split(" OR ");
    if (parts.length === 2) {
      return {
        type: "Logical",
        op: "OR",
        left: parseConditionToAst(parts[0].trim()),
        right: parseConditionToAst(parts[1].trim()),
      };
    }
  }

  // パースできない場合はエラー
  throw new DslConversionError(`条件式をパースできませんでした: ${condition}`);
}

/**
 * StrategyDSLをStrategyASTに変換
 */
export function convertDslToAst(dsl: StrategyDSL): StrategyAST {
  try {
    const entryAst = parseConditionToAst(dsl.entry.condition);
    const exitAst = parseConditionToAst(dsl.exit.condition);

    const strategyAst: StrategyAST = {
      entry: {
        ast: entryAst,
        timing: dsl.entry.timing,
      },
      exit: {
        ast: exitAst,
        timing: dsl.exit.timing,
      },
      universe: dsl.universe,
      cash: dsl.cash,
      slippage_bp: dsl.slippage_bp,
    };

    return strategyAst;
  } catch (error) {
    if (error instanceof DslConversionError) {
      throw error;
    }
    throw new DslConversionError(
      `DSLからASTへの変換中にエラーが発生しました: ${(error as Error).message}`,
      error
    );
  }
}

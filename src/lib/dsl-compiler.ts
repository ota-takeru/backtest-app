import {
  StrategyDSL,
  BoolExprASTNode,
  LogicalOperationNode,
  Term,
  LogicalOperator,
  ComparisonOperator,
  Compare,
} from "../types/dsl";

// この型は dsl.ts にあるべきかもしれないが、コンパイラ内部でのみ使用する可能性も考慮し一旦ここに定義
// type ParsedFunc = { name: string; arg: number }; // 今回は単純化のため未使用
// type ParsedTerm = string | number | ParsedFunc; // Term型を直接使用

const comparisonOperators: ComparisonOperator[] = [
  ">=",
  "<=",
  ">",
  "<",
  "==",
  "!=",
];
const logicalOperators: LogicalOperator[] = ["&&", "||"];

/**
 * 項 (Term) をパースする ("rsi(14)", "price", "70" など)
 */
function parseTerm(termStr: string): Term {
  termStr = termStr.trim();
  if (/^\d+(?:\.\d+)?$/.test(termStr)) {
    const numValue = parseFloat(termStr);
    return numValue;
  }
  return termStr;
}

/**
 * Term を SQL の対応する式に変換する
 * indicatorsTableName は、インジケータとOHLCVがJOIN済みのCTE名を指す想定 (例: ohlc_with_indicators)
 */
function termToSql(
  term: Term,
  indicatorsTableName: string = "ohlc_with_indicators"
): string {
  if (typeof term === "number") {
    return term.toString();
  }
  if (typeof term === "string") {
    // 関数形式 (例: "rsi(14)", "ma(5)", "atr(20)")
    // "ma(close, 5)" のような複数引数もパースできる形だが、現状のDSLでは1引数のみ
    const funcMatch = term.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([^)]*)\)$/i);
    if (funcMatch) {
      const funcName = funcMatch[1].toLowerCase();
      const argsStr = funcMatch[2].trim();
      const args = argsStr
        .split(",")
        .map((arg) => arg.trim())
        .filter((arg) => arg !== "");

      let period: number;
      let columnName: string = "close"; // MAのデフォルト対象カラム

      if (funcName === "rsi" || funcName === "atr") {
        if (args.length === 1 && /^\d+$/.test(args[0])) {
          // rsi(14), atr(14)
          period = parseInt(args[0], 10);
        } else if (
          args.length === 2 &&
          /^\w+$/.test(args[0]) &&
          /^\d+$/.test(args[1])
        ) {
          // rsi(price, 14)
          columnName =
            args[0].toLowerCase() === "price" ? "close" : args[0].toLowerCase();
          period = parseInt(args[1], 10);
          // rsi, atr は通常 close/high/low を使うので columnName の指定はあまり意味がない
        } else {
          throw new Error(`Invalid arguments for ${funcName}: ${argsStr}`);
        }
        if (funcName === "rsi")
          return `\`${indicatorsTableName}\`.\`rsi_${period}\``;
        if (funcName === "atr")
          return `\`${indicatorsTableName}\`.\`atr_${period}\``;
      } else if (funcName === "ma") {
        if (args.length === 1 && /^\d+$/.test(args[0])) {
          // ma(5)
          period = parseInt(args[0], 10);
          columnName = "close"; // ma(N) は ma(close, N) と同義
        } else if (
          args.length === 2 &&
          /^\w+$/.test(args[0]) &&
          /^\d+$/.test(args[1])
        ) {
          // ma(price, 5)
          columnName =
            args[0].toLowerCase() === "price" ? "close" : args[0].toLowerCase();
          period = parseInt(args[1], 10);
        } else {
          throw new Error(`Invalid arguments for MA: ${argsStr}`);
        }
        return `\`${indicatorsTableName}\`.\`ma_${columnName}_${period}\``;
      } else {
        // 他の関数 (例: lag(close,1)) は直接SQL関数として展開することも検討できるが、
        // 今回は定義済みの rsi, atr, ma のみサポート
        throw new Error(`Unknown or unsupported function in term: ${term}`);
      }
    }

    // 識別子 (例: "price", "close", "entry_price")
    const allowedIdentifiers = [
      "price",
      "high",
      "low",
      "close",
      "volume",
      "open",
      "entry_price",
    ];
    const lowerTerm = term.toLowerCase();

    if (allowedIdentifiers.includes(lowerTerm)) {
      if (lowerTerm === "entry_price") {
        // entry_price は特別なCTE (例: `current_position_details`) のカラムを参照する想定
        // astToSqlPredicateを呼び出す側で、どの述語タイプ(entry/exit)に応じてtableNameを使い分けるか、
        // あるいは、indicatorsTableName に entry_price が含まれるようにJOINされている前提。
        return `\`${indicatorsTableName}\`.\`entry_price\``;
      }
      const resolvedTerm = lowerTerm === "price" ? "close" : lowerTerm;
      return `\`${indicatorsTableName}\`.\`${resolvedTerm}\``;
    }

    throw new Error(
      `Invalid identifier or unexpected string term: "${term}". ` +
        `Allowed identifiers are: ${allowedIdentifiers.join(", ")}. `
    );
  }
  throw new Error(`Unknown term type: ${typeof term}`);
}

/**
 * 比較式文字列 ("rsi(14) > 70"など) をパースする
 */
function parseComparison(compStr: string): Compare {
  compStr = compStr.trim();
  for (const op of comparisonOperators) {
    const parts = compStr.split(op);
    if (parts.length === 2) {
      const leftStr = parts[0].trim();
      const rightStr = parts[1].trim();
      let leftTerm, rightTerm;
      try {
        leftTerm = parseTerm(leftStr);
      } catch (e: any) {
        throw new Error(
          `Failed to parse left side of comparison "${leftStr}" in "${compStr}": ${e.message}`
        );
      }
      try {
        rightTerm = parseTerm(rightStr);
      } catch (e: any) {
        throw new Error(
          `Failed to parse right side of comparison "${rightStr}" in "${compStr}": ${e.message}`
        );
      }
      return {
        left: leftTerm,
        operator: op as ComparisonOperator,
        right: rightTerm,
      };
    }
  }
  throw new Error(
    `Invalid comparison string: "${compStr}". No valid comparison operator found or incorrect structure.`
  );
}

/**
 * BOOL_EXPR 文字列をパースして AST (のようなもの) に変換する (簡易版)
 * "rsi(14) > 70 && ma(5) < ma(20)" のような文字列を想定
 * 括弧は演算子の優先順位には影響せず、あくまで関数の引数でのみ使用される想定
 * 現状は && のみサポート (左結合)
 */
export function parseBoolExpr(expr: string): BoolExprASTNode {
  expr = expr.trim();

  // Initial parenthesis balance check
  let parenBalance = 0;
  for (let char of expr) {
    if (char === "(") parenBalance++;
    else if (char === ")") parenBalance--;
    if (parenBalance < 0) {
      throw new Error(
        `Mismatched parentheses: Unmatched closing parenthesis in "${expr}"`
      );
    }
  }
  if (parenBalance !== 0) {
    throw new Error(
      `Mismatched parentheses: Unmatched opening parenthesis in "${expr}"`
    );
  }

  // 演算子の優先順位: || < &&
  // まず、最も外側の || を見つけて分割する
  // 例: A && B || C && D  -> (A && B) || (C && D)
  // 例: (A || B) && C     -> ((A || B)) && (C) <- これは括弧があるので && が優先

  let balance = 0;
  let splitIndex = -1;

  // 1. OR (||) で分割 (括弧を考慮)
  for (let i = expr.length - 1; i >= 0; i--) {
    if (expr[i] === ")") balance++;
    else if (expr[i] === "(") balance--;
    else if (balance === 0 && expr[i] === "|" && expr[i - 1] === "|") {
      splitIndex = i - 1;
      break;
    }
  }

  if (splitIndex !== -1) {
    const leftExpr = expr.substring(0, splitIndex).trim();
    const rightExpr = expr.substring(splitIndex + 2).trim();
    if (!leftExpr || !rightExpr) {
      throw new Error(
        `Invalid OR expression: parts are empty near '${expr.substring(
          splitIndex,
          splitIndex + 2
        )}'`
      );
    }
    return {
      left: parseBoolExpr(leftExpr),
      operator: "||",
      right: parseBoolExpr(rightExpr),
    };
  }

  // 2. AND (&&) で分割 (括弧を考慮)
  balance = 0;
  splitIndex = -1;
  for (let i = expr.length - 1; i >= 0; i--) {
    if (expr[i] === ")") balance++;
    else if (expr[i] === "(") balance--;
    else if (balance === 0 && expr[i] === "&" && expr[i - 1] === "&") {
      splitIndex = i - 1;
      break;
    }
  }

  if (splitIndex !== -1) {
    const leftExpr = expr.substring(0, splitIndex).trim();
    const rightExpr = expr.substring(splitIndex + 2).trim();
    if (!leftExpr || !rightExpr) {
      throw new Error(
        `Invalid AND expression: parts are empty near '${expr.substring(
          splitIndex,
          splitIndex + 2
        )}'`
      );
    }
    return {
      left: parseBoolExpr(leftExpr),
      operator: "&&",
      right: parseBoolExpr(rightExpr),
    };
  }

  // 3. 比較式としてパース
  try {
    return parseComparison(expr);
  } catch (e: any) {
    throw new Error(
      `Failed to parse as comparison or logical expression: "${expr}". ${e.message}`
    );
  }
}

/**
 * パースされた BOOL_EXPR AST を SQL の WHERE 句の述語に変換する
 */
export function astToSqlPredicate(
  astNode: BoolExprASTNode,
  indicatorsTableName: string = "ohlc_with_indicators" // このテーブルが全ての指標とOHLCVデータを持つ前提
): string {
  function isLogicalNode(node: BoolExprASTNode): node is LogicalOperationNode {
    return (
      (node as LogicalOperationNode).operator === "&&" ||
      (node as LogicalOperationNode).operator === "||"
    );
  }

  function isCompareNode(node: BoolExprASTNode): node is Compare {
    return comparisonOperators.includes(
      (node as Compare).operator as ComparisonOperator
    );
  }

  if (isLogicalNode(astNode)) {
    const leftSql = astToSqlPredicate(astNode.left, indicatorsTableName);
    const rightSql = astToSqlPredicate(astNode.right, indicatorsTableName);
    return `(${leftSql} ${
      astNode.operator === "&&" ? "AND" : "OR"
    } ${rightSql})`;
  } else if (isCompareNode(astNode)) {
    const leftSql = termToSql(astNode.left, indicatorsTableName);
    const rightSql = termToSql(astNode.right, indicatorsTableName);
    const sqlOperator = astNode.operator === "==" ? "=" : astNode.operator;
    return `${leftSql} ${sqlOperator} ${rightSql}`;
  }
  throw new Error("Unknown AST node type in astToSqlPredicate");
}

/**
 * StrategyDSL オブジェクト全体を SQL クエリに変換する (SELECT 文の骨子)
 */
export function compileDslToSql(
  dsl: StrategyDSL,
  indicatorsTableName: string = "ohlc_with_indicators"
): {
  entryConditionSql: string;
  exitConditionSql: string;
  // 必要に応じて他の情報 (例: 使用されている指標のリストなど)
} {
  const entryAst = parseBoolExpr(dsl.entry.condition);
  const exitAst = parseBoolExpr(dsl.exit.condition);

  const entryConditionSql = astToSqlPredicate(entryAst, indicatorsTableName);
  const exitConditionSql = astToSqlPredicate(exitAst, indicatorsTableName);

  return {
    entryConditionSql,
    exitConditionSql,
  };
}

// To prevent 'runBasicTests is defined but never used'
// function runBasicTests() {}
// runBasicTests()

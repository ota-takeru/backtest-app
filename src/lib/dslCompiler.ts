import {
  StrategyAST,
  AnyNode,
  FuncNode,
  ValueNode,
  BinaryNode,
  LogicalNode,
  IdentifierValue,
} from "../types";

// 許可されたカラム名のホワイトリスト
const ALLOWED_COLUMNS = [
  "price",
  "entry_price",
  "high",
  "low",
  "close",
  "volume",
] as const;

// SQLインジェクション対策のためのエスケープ関数
function escapeSqlIdentifier(identifier: string): string {
  // 許可されたカラム名のみを使用
  if (!ALLOWED_COLUMNS.includes(identifier as IdentifierValue)) {
    throw new Error(`Invalid column name: ${identifier}`);
  }
  return identifier;
}

function generateFunctionNodeKey(node: FuncNode): string {
  const argsString = node.args
    .map((arg) =>
      typeof arg === "number"
        ? arg.toString()
        : (arg as ValueNode).value.toString()
    )
    .join("_");
  return `${node.name}_${argsString}`;
}

function generateCteForFuncNode(node: FuncNode, reqId: string): string {
  const key = generateFunctionNodeKey(node);

  switch (node.name) {
    case "ma":
      let period: number;
      let columnName: string = "close"; // デフォルトは close
      if (node.args.length === 1) {
        const firstArg = node.args[0];
        if (typeof firstArg === "number") {
          period = firstArg;
        } else {
          throw new Error(
            "MA function requires a period argument when only one argument is provided."
          );
        }
      } else if (node.args.length === 2) {
        const firstArg = node.args[0];
        const secondArg = node.args[1];
        if (
          typeof firstArg !== "number" && // Check if firstArg is not a number first
          firstArg.type === "Value" &&
          firstArg.kind === "IDENT" &&
          typeof secondArg === "number"
        ) {
          columnName = escapeSqlIdentifier(firstArg.value as string);
          period = secondArg;
        } else {
          throw new Error(
            "Invalid arguments for MA function. Expected (IDENT, number)."
          );
        }
      } else {
        throw new Error(
          "Invalid number of arguments for MA function. Expected 1 or 2."
        );
      }
      if (period <= 0) throw new Error("MA period must be positive");
      return `,
  ${key} AS (
    SELECT date,
           AVG(${columnName}) OVER (ORDER BY date ROWS BETWEEN ${
        period - 1
      } PRECEDING AND CURRENT ROW) AS ${key}
    FROM ohlc_${reqId}
  )`;
    case "rsi":
      const rsiFirstArg = node.args[0];
      if (typeof rsiFirstArg !== "number" || node.args.length !== 1) {
        throw new Error(
          "RSI function requires a single number argument for period."
        );
      }
      const rsiPeriod = rsiFirstArg;
      if (rsiPeriod <= 0) throw new Error("RSI period must be positive");
      // RSI の columnName は close 固定とする (REQUIREMENTS.md §4.1)
      return `,
  ${key} AS (
    WITH diffs AS (
      SELECT date, close - LAG(close) OVER (ORDER BY date) AS d FROM ohlc_${reqId}
    )
    SELECT date,
           100 - (100 / (1 + (SUM(GREATEST(d,0)) OVER w / NULLIF(SUM(ABS(LEAST(d,0))) OVER w,0)))) AS ${key}
    FROM diffs
    WINDOW w AS (ORDER BY date ROWS BETWEEN ${
      rsiPeriod - 1
    } PRECEDING AND CURRENT ROW)
  )`;
    case "atr":
      const atrFirstArg = node.args[0];
      if (typeof atrFirstArg !== "number" || node.args.length !== 1) {
        throw new Error(
          "ATR function requires a single number argument for period."
        );
      }
      const atrPeriod = atrFirstArg;
      if (atrPeriod <= 0) throw new Error("ATR period must be positive");
      return `,
  ${key} AS (
    WITH tr AS (
      SELECT 
        date,
        GREATEST(
          high - low,
          ABS(high - LAG(close) OVER (ORDER BY date)),
          ABS(low - LAG(close) OVER (ORDER BY date))
        ) as tr_value
      FROM ohlc_${reqId}
    )
    SELECT date,
           AVG(tr_value) OVER (ORDER BY date ROWS BETWEEN ${
             atrPeriod - 1
           } PRECEDING AND CURRENT ROW) AS ${key}
    FROM tr
  )`;
    default:
      throw new Error(`Unsupported function: ${node.name}`);
  }
}

function astToSqlRecursive(
  node: AnyNode,
  reqId: string,
  ctes: Map<string, string>
): string {
  switch (node.type) {
    case "Logical":
      return `(${astToSqlRecursive(node.left, reqId, ctes)} ${
        node.op
      } ${astToSqlRecursive(node.right, reqId, ctes)})`;
    case "Binary":
      const leftSql = astToSqlRecursive(node.left, reqId, ctes);
      const rightSql = astToSqlRecursive(node.right, reqId, ctes);
      return `(${leftSql} ${node.op} ${rightSql})`;
    case "Func":
      const key = generateFunctionNodeKey(node);
      if (!ctes.has(key)) {
        ctes.set(key, generateCteForFuncNode(node, reqId));
      }
      return key; // CTE名を参照
    case "Value":
      if (node.kind === "NUMBER") {
        return node.value.toString();
      }
      // IDENT の場合はカラム名やCTE名として扱う前にエスケープ
      return escapeSqlIdentifier(node.value.toString());
    default:
      // @ts-expect-error - Exhaustive check
      throw new Error(`Unknown AST node type: ${node.type}`);
  }
}

export function compileDslToSql(
  strategyAst: StrategyAST,
  reqId: string = "test_req"
): string {
  const ctes = new Map<string, string>();

  // AST を走査して FuncNode を収集し、CTEを生成 (astToSqlRecursive内で処理される)
  const entryPredicateSql = astToSqlRecursive(
    strategyAst.entry.ast,
    reqId,
    ctes
  );
  const exitPredicateSql = astToSqlRecursive(strategyAst.exit.ast, reqId, ctes);

  let ctesSql = "";
  ctes.forEach((cte) => {
    ctesSql += `${cte}\n`;
  });

  // REQUIREMENTS.md §4. AST → SQL 変換規則 に従い、SQLパイプラインに埋め込む
  // この基本実装では、単純に必要なCTEと条件式を文字列結合する
  // 完全なバックテストSQLパイプラインはここでは構築しない
  const finalSql = `
WITH ohlc_${reqId} AS (SELECT * FROM ohlc_data) -- 仮のOHLCデータテーブル
${ctesSql}
SELECT
  date,
  close,
  CASE
    WHEN ${entryPredicateSql} THEN 'BUY'
    WHEN ${exitPredicateSql} THEN 'SELL'
    ELSE NULL
  END AS signal
FROM ohlc_${reqId}
${
  ctes.size > 0 ? ctes.forEach((key) => `LEFT JOIN ${key} USING (date)`) : ""
} -- CTEをJOIN (仮)
WHERE ${entryPredicateSql} OR ${exitPredicateSql};
`;
  // TODO: 上記のSQLはあくまでコンパイル結果のイメージであり、実際のバックテストロジックは
  // DuckDB Worker内で別途組み立てる想定。ここでは entry/exit predicate と CTEs が生成されることを確認する。

  return `WITH ohlc_${reqId} AS (SELECT * FROM ohlc_data) -- This is a placeholder
${ctesSql.trim()}
SELECT CASE WHEN ${entryPredicateSql} THEN 1 ELSE 0 END AS entry_signal, CASE WHEN ${exitPredicateSql} THEN 1 ELSE 0 END AS exit_signal;`;
}

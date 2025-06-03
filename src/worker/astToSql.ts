import { StrategyAST, AnyNode, FuncNode } from "../types";

export class AstToSqlError extends Error {
  constructor(message: string, public details?: unknown) {
    super(message);
    this.name = "AstToSqlError";
  }
}

function generateFunctionCTE(funcNode: FuncNode, ohlcTable: string): string {
  // 引数から適切な文字列を生成（数値と識別子の値のみ）
  const args = funcNode.args
    .map((arg) => {
      if (typeof arg === "number") {
        return arg.toString();
      } else if (typeof arg === "object" && arg.value) {
        return arg.value;
      } else {
        return "unknown";
      }
    })
    .join("_");
  const cteName = `${funcNode.name}_${args}`.replace(/\./g, ""); // ドットを削除

  switch (funcNode.name) {
    case "ma":
      // ma関数は期間（数値）のみを受け取る場合をサポート（デフォルトはclose）
      if (funcNode.args.length === 1 && typeof funcNode.args[0] === "number") {
        const maPeriod = funcNode.args[0] as number;
        const maCol = "close"; // デフォルトカラム
        return `${cteName} AS (
  SELECT base.date, AVG(base.${maCol}) OVER (ORDER BY base.date ROWS BETWEEN ${
          maPeriod - 1
        } PRECEDING AND CURRENT ROW) AS value
  FROM ${ohlcTable} base
)`;
      } else if (
        funcNode.args.length === 2 &&
        typeof funcNode.args[0] === "number" &&
        typeof funcNode.args[1] === "object" &&
        funcNode.args[1].kind === "IDENT"
      ) {
        const maPeriod = funcNode.args[0] as number;
        const maCol = funcNode.args[1].value;
        return `${cteName} AS (
  SELECT base.date, AVG(base.${maCol}) OVER (ORDER BY base.date ROWS BETWEEN ${
          maPeriod - 1
        } PRECEDING AND CURRENT ROW) AS value
  FROM ${ohlcTable} base
)`;
      } else {
        throw new AstToSqlError("Invalid MA arguments", funcNode.args);
      }

    case "rsi":
      if (
        funcNode.args.length !== 2 ||
        typeof funcNode.args[0] !== "number" ||
        typeof funcNode.args[1] !== "object" ||
        funcNode.args[1].kind !== "IDENT"
      ) {
        throw new AstToSqlError("Invalid RSI arguments", funcNode.args);
      }
      const rsiPeriod = funcNode.args[0] as number;
      const rsiCol = funcNode.args[1].value;
      return `${cteName}_diffs AS (
  SELECT base.date, base.${rsiCol} - LAG(base.${rsiCol}) OVER (ORDER BY base.date) AS diff
  FROM ${ohlcTable} base
),
${cteName} AS (
  SELECT 
    d.date, 
    100.0 - (100.0 / (1.0 + SUM(CASE WHEN d.diff > 0 THEN d.diff ELSE 0 END) OVER (ORDER BY d.date ROWS BETWEEN ${
      rsiPeriod - 1
    } PRECEDING AND CURRENT ROW) / 
                           NULLIF(SUM(CASE WHEN d.diff < 0 THEN ABS(d.diff) ELSE 0 END) OVER (ORDER BY d.date ROWS BETWEEN ${
                             rsiPeriod - 1
                           } PRECEDING AND CURRENT ROW), 0)))
    AS value
  FROM ${cteName}_diffs d
)`;

    case "atr":
      if (funcNode.args.length !== 1 || typeof funcNode.args[0] !== "number") {
        throw new AstToSqlError("Invalid ATR arguments", funcNode.args);
      }
      const atrPeriod = funcNode.args[0] as number;
      return `${cteName}_tr AS (
  SELECT 
    base.date, 
    GREATEST(
      base.high - base.low, 
      ABS(base.high - LAG(base.close) OVER (ORDER BY base.date)), 
      ABS(base.low - LAG(base.close) OVER (ORDER BY base.date))
    ) AS tr
  FROM ${ohlcTable} base
),
${cteName} AS (
  SELECT tr.date, AVG(tr.tr) OVER (ORDER BY tr.date ROWS BETWEEN ${
    atrPeriod - 1
  } PRECEDING AND CURRENT ROW) AS value
  FROM ${cteName}_tr tr
)`;

    default:
      throw new AstToSqlError(`Unsupported function: ${funcNode.name}`);
  }
}

function nodeToSqlPredicate(
  node: AnyNode,
  functionCteMap: Map<string, FuncNode>
): string {
  switch (node.type) {
    case "Logical":
      const leftLogic = nodeToSqlPredicate(node.left, functionCteMap);
      const rightLogic = nodeToSqlPredicate(node.right, functionCteMap);
      return `(${leftLogic} ${node.op} ${rightLogic})`;

    case "Binary":
      const leftBinary = nodeToSqlPredicate(node.left, functionCteMap);
      const rightBinary = nodeToSqlPredicate(node.right, functionCteMap);
      return `(${leftBinary} ${node.op} ${rightBinary})`;

    case "Func":
      const funcArgs = node.args
        .map((arg) => (typeof arg === "number" ? arg : arg.value))
        .join("_");
      const funcCteName = `${node.name}_${funcArgs}`.replace(/\./g, "");
      if (!functionCteMap.has(funcCteName)) {
        functionCteMap.set(funcCteName, node);
      }
      return `${funcCteName}.value`;

    case "Value":
      if (node.kind === "NUMBER") {
        return node.value.toString();
      } else {
        // IDENT like 'close', 'open' etc. - need to reference base table
        return `base.${node.value}`;
      }

    default:
      throw new AstToSqlError("Unknown AST node type");
  }
}

export function astToSql(
  ast: StrategyAST,
  initCash: number,
  slippageBp: number,
  ohlcTable: string
): string {
  const functionCteMap = new Map<string, FuncNode>();

  // Generate SQL predicates for entry and exit, this will populate functionCteMap
  const entryPredicate = nodeToSqlPredicate(ast.entry.ast, functionCteMap);
  const exitPredicate = nodeToSqlPredicate(ast.exit.ast, functionCteMap);

  // Build CTEs
  const cteList: string[] = [];
  functionCteMap.forEach((funcNode) => {
    cteList.push(generateFunctionCTE(funcNode, ohlcTable));
  });

  let ctes = "";
  if (cteList.length > 0) {
    ctes = `WITH\n${cteList.join(",\n")},\n`;
  }

  // Build the main backtesting SQL with simplified logic for initial testing
  const finalQuery = `
${ctes}
${ctes ? "" : "WITH "}signals AS (
  SELECT 
    base.date,
    base.close,
    base.high,
    base.low,
    base.volume,
    ${entryPredicate} as entry_signal,
    ${exitPredicate} as exit_signal
  FROM ${ohlcTable} base
  ${
    cteList.length > 0
      ? cteList
          .map((_, idx) => {
            const funcName = Array.from(functionCteMap.keys())[idx];
            return `LEFT JOIN ${funcName} ON base.date = ${funcName}.date`;
          })
          .join("\n  ")
      : ""
  }
  ORDER BY base.date
),

-- Trade state management with position tracking
position_changes AS (
  SELECT 
    s.date,
    s.close,
    s.entry_signal,
    s.exit_signal,
    ROW_NUMBER() OVER (ORDER BY s.date) as row_num,
    CASE 
      WHEN s.entry_signal AND NOT COALESCE(LAG(s.entry_signal) OVER (ORDER BY s.date), false) THEN 'ENTER'
      WHEN s.exit_signal AND COALESCE(LAG(s.entry_signal) OVER (ORDER BY s.date), false) THEN 'EXIT'
      ELSE 'HOLD'
    END as action
  FROM signals s
),

-- Generate actual trades with entry/exit pairs
trade_pairs AS (
  SELECT 
    p1.date as entry_date,
    p1.close as entry_price,
    p2.date as exit_date,
    p2.close as exit_price,
    ROW_NUMBER() OVER (ORDER BY p1.date) as trade_id
  FROM position_changes p1
  JOIN position_changes p2 ON p2.row_num > p1.row_num
  WHERE p1.action = 'ENTER' 
    AND p2.action = 'EXIT'
    AND NOT EXISTS (
      SELECT 1 FROM position_changes p3 
      WHERE p3.row_num > p1.row_num 
        AND p3.row_num < p2.row_num 
        AND p3.action IN ('ENTER', 'EXIT')
    )
),

-- Calculate trade metrics
trade_details AS (
  SELECT 
    trade_id,
    entry_date,
    exit_date,
    entry_price,
    exit_price,
    (${initCash} / entry_price) as qty,
    ((exit_price - entry_price) / entry_price) as return_pct,
    (exit_price - entry_price) * (${initCash} / entry_price) * (1 - ${slippageBp}/10000.0) as pnl,
    DATE_DIFF('day', entry_date, exit_date) as duration
  FROM trade_pairs
),

-- Build equity curve
equity_curve AS (
  SELECT 
    s.date,
    s.close,
    ${initCash} + COALESCE(SUM(td.pnl), 0) as equity
  FROM signals s
  LEFT JOIN trade_details td ON td.exit_date <= s.date
  GROUP BY s.date, s.close
),

-- Calculate portfolio metrics
portfolio_stats AS (
  SELECT 
    COUNT(*) as total_trades,
    AVG(return_pct) as avg_return,
    STDDEV(return_pct) as return_std,
    ANY_VALUE(eq_stats.max_equity) as max_equity,
    ANY_VALUE(eq_stats.min_equity) as min_equity,
    (ANY_VALUE(eq_stats.max_equity) - ${initCash}) / ${initCash} as total_return
  FROM trade_details
  CROSS JOIN (SELECT MAX(equity) as max_equity, MIN(equity) as min_equity FROM equity_curve) eq_stats
),

-- Calculate final metrics
final_metrics AS (
  SELECT 
    POWER(1 + ps.total_return, 365.0 / DATE_DIFF('day', ec_range.min_date, ec_range.max_date)) - 1 as cagr,
    (ps.min_equity - ps.max_equity) / ps.max_equity as max_drawdown,
    CASE 
      WHEN ps.return_std > 0 THEN ps.avg_return / ps.return_std * SQRT(252)
      ELSE 0 
    END as sharpe_ratio
  FROM portfolio_stats ps
  CROSS JOIN (SELECT MIN(date) as min_date, MAX(date) as max_date FROM equity_curve) ec_range
)

-- Return results in REQUIREMENTS.md format
SELECT 'metrics' as type, 
       COALESCE(fm.cagr, 0) as cagr, 
       COALESCE(fm.max_drawdown, 0) as maxDd, 
       COALESCE(fm.sharpe_ratio, 0) as sharpe,
       NULL as date, 
       NULL as equity,
       NULL as id, NULL as code, NULL as side, NULL as entryDate, NULL as exitDate, 
       NULL as qty, NULL as entryPx, NULL as exitPx, NULL as slippageBp, 
       NULL as pnl, NULL as pnlPct, NULL as duration
FROM final_metrics fm
UNION ALL
SELECT 'equity_point' as type, 
       NULL as cagr, NULL as maxDd, NULL as sharpe,
       ec.date, 
       ec.equity,
       NULL as id, NULL as code, NULL as side, NULL as entryDate, NULL as exitDate, 
       NULL as qty, NULL as entryPx, NULL as exitPx, NULL as slippageBp, 
       NULL as pnl, NULL as pnlPct, NULL as duration
FROM equity_curve ec
UNION ALL  
SELECT 'trade_log' as type, 
       NULL as cagr, NULL as maxDd, NULL as sharpe,
       NULL as date, NULL as equity,
       td.trade_id as id, 
       '${ast.universe[0]}' as code, 
       'long' as side, 
       td.entry_date as entryDate, 
       td.exit_date as exitDate,
       ROUND(td.qty, 0) as qty, 
       ROUND(td.entry_price, 2) as entryPx, 
       ROUND(td.exit_price, 2) as exitPx, 
       ${slippageBp} as slippageBp,
       ROUND(td.pnl, 2) as pnl, 
       ROUND(td.return_pct * 100, 2) as pnlPct, 
       td.duration as duration
FROM trade_details td;
`;

  return finalQuery;
}

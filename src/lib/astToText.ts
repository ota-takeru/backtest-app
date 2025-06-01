import { StrategyAST, AnyNode } from "../types";

/**
 * ASTノードを人間が読みやすいテキストに変換
 */
export function nodeToText(node: AnyNode): string {
  switch (node.type) {
    case "Binary":
      const left = nodeToText(node.left);
      const right = nodeToText(node.right);
      const opMap: { [key: string]: string } = {
        ">": "より大きい",
        "<": "より小さい",
        ">=": "以上",
        "<=": "以下",
        "==": "等しい",
        "!=": "等しくない",
      };
      return `${left}が${right}${opMap[node.op] || node.op}`;

    case "Logical":
      const leftLogical = nodeToText(node.left);
      const rightLogical = nodeToText(node.right);
      const logicalOpMap = {
        AND: "かつ",
        OR: "または",
      };
      return `(${leftLogical}) ${logicalOpMap[node.op]} (${rightLogical})`;

    case "Func":
      const funcNameMap: { [key: string]: string } = {
        ma: "移動平均",
        rsi: "RSI",
        atr: "ATR",
      };
      const funcName = funcNameMap[node.name] || node.name;

      if (node.name === "ma" && node.args.length >= 2) {
        const column =
          typeof node.args[1] === "object" ? node.args[1].value : node.args[1];
        const period =
          typeof node.args[0] === "number" ? node.args[0] : node.args[0];
        return `${column}の${period}日${funcName}`;
      } else if (node.name === "rsi" || node.name === "atr") {
        const period =
          typeof node.args[0] === "number" ? node.args[0] : node.args[0];
        return `${period}日${funcName}`;
      }

      return `${funcName}(${node.args.join(", ")})`;

    case "Value":
      if (node.kind === "NUMBER") {
        return node.value.toString();
      } else {
        const identMap: { [key: string]: string } = {
          close: "終値",
          open: "始値",
          high: "高値",
          low: "安値",
          volume: "出来高",
          price: "価格",
          entry_price: "エントリー価格",
        };
        return identMap[node.value as string] || node.value.toString();
      }

    default:
      return "不明な条件";
  }
}

/**
 * StrategyASTを人間が読みやすいテキストに変換
 */
export function strategyToText(strategy: StrategyAST): {
  entryCondition: string;
  exitCondition: string;
  summary: string;
} {
  const entryCondition = nodeToText(strategy.entry.ast);
  const exitCondition = nodeToText(strategy.exit.ast);

  const summary = `${entryCondition}の時にエントリー、${exitCondition}の時にエグジット`;

  return {
    entryCondition,
    exitCondition,
    summary,
  };
}

// 実際のバックテスト実行テスト用設定
export const testConfigurations = {
  // 基本的な移動平均クロス戦略
  simpleMA: {
    name: "Simple MA Cross",
    description: "5日移動平均が20日移動平均を上回ったときにエントリー",
    dataConfig: {
      codes: ["7203"], // トヨタ自動車
      startDate: "2023-01-01",
      endDate: "2023-12-31",
    },
    strategy: {
      entry: {
        ast: {
          type: "Binary",
          op: ">",
          left: {
            type: "Func",
            name: "ma",
            args: [5, { type: "Value", kind: "IDENT", value: "close" }],
          },
          right: {
            type: "Func",
            name: "ma",
            args: [20, { type: "Value", kind: "IDENT", value: "close" }],
          },
        },
        timing: "next_open",
      },
      exit: {
        ast: {
          type: "Binary",
          op: "<",
          left: {
            type: "Func",
            name: "ma",
            args: [5, { type: "Value", kind: "IDENT", value: "close" }],
          },
          right: {
            type: "Func",
            name: "ma",
            args: [20, { type: "Value", kind: "IDENT", value: "close" }],
          },
        },
        timing: "current_close",
      },
      slippage_bp: 3,
      commission_bp: 10,
      cash: 1000000,
    },
  },

  // RSI戦略
  rsiStrategy: {
    name: "RSI Oversold/Overbought",
    description: "RSIが30以下で買い、70以上で売り",
    dataConfig: {
      codes: ["9984"], // ソフトバンクグループ
      startDate: "2023-01-01",
      endDate: "2023-12-31",
    },
    strategy: {
      entry: {
        ast: {
          type: "Binary",
          op: "<",
          left: {
            type: "Func",
            name: "rsi",
            args: [14, { type: "Value", kind: "IDENT", value: "close" }],
          },
          right: {
            type: "Value",
            kind: "NUMBER",
            value: 30,
          },
        },
        timing: "next_open",
      },
      exit: {
        ast: {
          type: "Binary",
          op: ">",
          left: {
            type: "Func",
            name: "rsi",
            args: [14, { type: "Value", kind: "IDENT", value: "close" }],
          },
          right: {
            type: "Value",
            kind: "NUMBER",
            value: 70,
          },
        },
        timing: "current_close",
      },
      slippage_bp: 3,
      commission_bp: 10,
      cash: 1000000,
    },
  },
};

console.log("🧪 バックテスト設定準備完了");
console.log("利用可能な戦略:", Object.keys(testConfigurations));

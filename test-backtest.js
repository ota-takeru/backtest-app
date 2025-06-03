// テスト用のバックテスト実行スクリプト
import { Worker } from "worker_threads";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log("🧪 DuckDB-WASMバックテスト統合テストを開始...");

// 簡単なテスト戦略
const testStrategy = {
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
};

const testConfig = {
  codes: ["7203"], // トヨタ
  startDate: "2023-01-01",
  endDate: "2023-12-31",
};

console.log("📊 テスト設定:");
console.log("- 銘柄:", testConfig.codes);
console.log("- 期間:", testConfig.startDate, "〜", testConfig.endDate);
console.log("- 戦略: 5日移動平均 > 20日移動平均でエントリー");

// Worker を使ってバックテストを実行
console.log("🚀 バックテスト実行中...");

// 実際のテストはブラウザで行う必要があるため、このスクリプトはガイダンスとして機能
console.log("");
console.log("=".repeat(60));
console.log("🌐 ブラウザテスト手順:");
console.log("1. http://localhost:5179 にアクセス");
console.log('2. 銘柄選択で "7203" を入力');
console.log("3. 期間を 2023-01-01 から 2023-12-31 に設定");
console.log("4. 戦略エディタで簡単な移動平均クロス戦略を入力");
console.log("5. バックテスト実行ボタンをクリック");
console.log("6. 結果を確認");
console.log("=".repeat(60));

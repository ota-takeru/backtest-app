import React, { useState } from "react";
import { useApiKeys } from "./hooks/useApiKeys";
import { useOhlcData } from "./hooks/useOhlcData";
import { ApiKeyModal } from "./components/ApiKeyModal";
import { StockPeriodSelector } from "./components/StockPeriodSelector";
import { StrategyEditor } from "./components/StrategyEditor";
import { StrategyAST, AnyNode } from "./types";

export default function App() {
  const [step, setStep] = useState(1);
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);
  const { keys: apiKeys } = useApiKeys();
  const { ohlcData, isLoading, error, triggerRefetch } = useOhlcData();

  // データ設定の状態
  const [dataConfig, setDataConfig] = useState<{
    codes: string[];
    startDate: string;
    endDate: string;
  } | null>(null);

  // 戦略の状態
  const [strategy, setStrategy] = useState<StrategyAST | null>(null);

  // AST を人間が読みやすいテキストに変換するヘルパー関数
  const nodeToText = (node: AnyNode): string => {
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

        // ストップ高の特別検出パターン
        if (
          node.op === "==" &&
          node.left?.type === "Value" &&
          node.left?.value === "close" &&
          node.right?.type === "Value" &&
          node.right?.value === "high"
        ) {
          return "ストップ高判定（終値=高値）";
        }

        // 常にtrueな条件の検出
        if (
          node.op === "==" &&
          node.left?.type === "Value" &&
          node.left?.value === 1 &&
          node.right?.type === "Value" &&
          node.right?.value === 1
        ) {
          return "常に成立する条件（要改善）";
        }

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
          lag: "前日の",
          shift: "日前の",
          stop_high: "ストップ高判定",
          stop_low: "ストップ安判定",
        };
        const funcName = funcNameMap[node.name] || node.name;

        if (node.name === "ma" && node.args.length >= 2) {
          const column =
            typeof node.args[1] === "object"
              ? node.args[1].value
              : node.args[1];
          const period =
            typeof node.args[0] === "number" ? node.args[0] : node.args[0];
          return `${column}の${period}日${funcName}`;
        } else if (node.name === "rsi" || node.name === "atr") {
          const period =
            typeof node.args[0] === "number" ? node.args[0] : node.args[0];
          return `${period}日${funcName}`;
        } else if (node.name === "lag" && node.args.length >= 1) {
          const column =
            typeof node.args[0] === "object"
              ? nodeToText(node.args[0])
              : node.args[0];
          const days = node.args[1] || 1;
          return `${days}日前の${column}`;
        } else if (node.name === "stop_high") {
          return "ストップ高判定";
        } else if (node.name === "stop_low") {
          return "ストップ安判定";
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
  };

  const strategyToText = (strategy: StrategyAST) => {
    const entryCondition = nodeToText(strategy.entry.ast);
    const exitCondition = nodeToText(strategy.exit.ast);

    // 複雑な戦略パターンの検出と解釈
    let strategyType = "一般的な戦略";
    let warnings: string[] = [];
    let improvements: string[] = [];
    let interpretation = "";

    // ストップ高戦略の検出
    if (exitCondition.includes("ストップ高判定")) {
      strategyType = "ストップ高戦略";
      interpretation = "ストップ高になった銘柄を空売りし、翌日買い戻す戦略";

      if (entryCondition.includes("常に成立する条件")) {
        warnings.push(
          "エントリー条件が「常にtrue」になっています。ストップ高検出ロジックが正しく設定されていない可能性があります。"
        );
        improvements.push("前日ストップ高判定: lag(close == high, 1)");
        improvements.push("ショートポジション方向の明示");
        improvements.push("ストップ高率による絞り込み条件");
      }
    }

    // 移動平均戦略の検出
    if (
      entryCondition.includes("移動平均") ||
      exitCondition.includes("移動平均")
    ) {
      strategyType = "移動平均戦略";
      interpretation = "移動平均を基準としたトレンドフォロー戦略";

      if (
        !entryCondition.includes("移動平均") ||
        !exitCondition.includes("移動平均")
      ) {
        improvements.push(
          "エントリーとエグジットの両方で移動平均を使用することを検討"
        );
      }
    }

    // RSI戦略の検出
    if (entryCondition.includes("RSI") || exitCondition.includes("RSI")) {
      strategyType = "RSI逆張り戦略";
      interpretation = "RSIを基準とした過買い・過売りを狙う戦略";

      if (entryCondition.includes("RSI") && exitCondition.includes("RSI")) {
        // RSIが両方で使われている場合は良い設計
      } else {
        improvements.push(
          "RSI戦略では過買い(>70)と過売り(<30)の両方向を活用することを推奨"
        );
      }
    }

    // 一般的な改善提案
    if (strategy.cash && strategy.cash < 100000) {
      warnings.push("初期資金が少なすぎます。最低100,000円以上を推奨します。");
    }

    if (strategy.slippage_bp && strategy.slippage_bp > 10) {
      warnings.push("スリッページが高すぎます。通常は3-5bp程度が適切です。");
    }

    const summary =
      interpretation ||
      `${entryCondition}の時にエントリー、${exitCondition}の時にエグジット`;

    return {
      entryCondition,
      exitCondition,
      summary,
      strategyType,
      interpretation,
      warnings,
      improvements,
    };
  };

  const handleDataConfigSubmit = async (
    codes: string[],
    startDate: string,
    endDate: string
  ) => {
    setDataConfig({ codes, startDate, endDate });

    // 実際にデータをダウンロード
    console.log("Starting data download...");
    const result = await triggerRefetch(codes, startDate, endDate);

    if (result) {
      console.log("Data download successful, proceeding to next step");
      setStep(2); // 次のステップに進む
    } else {
      console.log("Data download failed, staying on current step");
    }
  };

  const handleStrategySubmit = (strategyAST: StrategyAST) => {
    setStrategy(strategyAST);
    console.log("Strategy submitted:", strategyAST);
    setStep(3); // バックテスト実行ステップに進む
  };

  return (
    <div className="container mx-auto p-4 space-y-6">
      <header className="flex justify-between items-center py-2 border-b mb-4">
        <h1 className="text-2xl font-bold">
          日本株クライアントサイド・バックテスト
        </h1>
        <button
          onClick={() => setIsApiKeyModalOpen(true)}
          className="px-3 py-2 border rounded text-sm hover:bg-gray-100"
        >
          APIキー設定
        </button>
      </header>

      <ApiKeyModal
        isOpen={isApiKeyModalOpen}
        onClose={() => setIsApiKeyModalOpen(false)}
      />

      <div className="mb-4 p-3 bg-green-100 text-green-800 rounded">
        ✓ アプリケーションが正常に起動しました - ステップ {step}/3
        {apiKeys.jquants_refresh && (
          <span className="ml-2 text-green-600">
            (J-Quants APIキー設定済み)
          </span>
        )}
        {ohlcData && (
          <span className="ml-2 text-blue-600">
            ({ohlcData.length}件のデータを取得済み)
          </span>
        )}
        {strategy && (
          <span className="ml-2 text-purple-600">(戦略定義済み)</span>
        )}
      </div>

      {!apiKeys.jquants_refresh && (
        <div className="p-4 bg-yellow-100 text-yellow-800 rounded">
          J-Quants Refresh
          Tokenが設定されていません。右上の「APIキー設定」からキーを登録してください。
        </div>
      )}

      {/* エラー表示 */}
      {error && (
        <div className="p-4 bg-red-100 text-red-800 rounded">
          <p className="font-semibold">エラーが発生しました:</p>
          <p>{error.message}</p>
        </div>
      )}

      {/* ローディング表示 */}
      {isLoading && (
        <div className="p-4 bg-blue-100 text-blue-800 rounded">
          <p>データをダウンロード中...</p>
        </div>
      )}

      {/* Step 1: 銘柄・期間選択 */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">1. 銘柄・期間の選択</h2>
        {!dataConfig ? (
          <StockPeriodSelector
            onSubmit={handleDataConfigSubmit}
            isLoading={isLoading}
          />
        ) : (
          <div className="p-4 border rounded bg-gray-50">
            <div className="flex justify-between items-start">
              <div>
                <p className="font-medium">選択済み:</p>
                <p>銘柄: {dataConfig.codes.join(", ")}</p>
                <p>
                  期間: {dataConfig.startDate} 〜 {dataConfig.endDate}
                </p>
                {ohlcData && (
                  <p className="text-green-600 mt-2">
                    ✓ {ohlcData.length}件のデータを取得しました
                  </p>
                )}
              </div>
              <button
                onClick={() => {
                  setDataConfig(null);
                  setStep(1);
                }}
                className="text-blue-600 hover:text-blue-800"
                disabled={isLoading}
              >
                変更
              </button>
            </div>
            <div className="mt-4">
              <button
                onClick={() => setStep(2)}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400"
                disabled={!apiKeys.jquants_refresh || !ohlcData || isLoading}
              >
                次のステップへ
              </button>
              {!apiKeys.jquants_refresh && (
                <p className="text-red-500 text-sm mt-2">
                  APIキーを設定してください
                </p>
              )}
              {!ohlcData && apiKeys.jquants_refresh && !isLoading && (
                <p className="text-orange-500 text-sm mt-2">
                  データのダウンロードが必要です
                </p>
              )}
            </div>
          </div>
        )}
      </section>

      {/* Step 2: 戦略定義 */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">2. 戦略の定義</h2>
        {step >= 2 ? (
          <div className="space-y-4">
            {/* 戦略エディター - 常に表示 */}
            <StrategyEditor
              onStrategySubmit={handleStrategySubmit}
              apiKeys={apiKeys}
            />

            {/* 戦略分析ヘルプ */}
            <div className="p-4 border rounded bg-amber-50 border-amber-200">
              <h3 className="font-medium text-amber-800 mb-2">
                🔍 戦略分析について
              </h3>
              <div className="text-sm text-amber-700 space-y-2">
                <p>
                  <strong>現在の実装状況</strong>
                  ：基本的な戦略パターン（移動平均、RSI、ストップ高）の検出と分析に対応。
                  複雑な戦略は段階的に改善予定です。
                </p>
                <details className="mt-2">
                  <summary className="cursor-pointer font-medium hover:text-amber-800">
                    ✅ 実装済み機能 / 🚧 改善予定
                  </summary>
                  <div className="mt-2 ml-4 space-y-3 text-xs">
                    <div>
                      <p className="font-medium text-green-700">
                        ✅ 実装済み機能:
                      </p>
                      <ul className="list-disc ml-4 space-y-1">
                        <li>基本的なAST→テキスト変換</li>
                        <li>戦略タイプの自動検出</li>
                        <li>警告メッセージと改善提案</li>
                        <li>ストップ高パターンの部分的検出</li>
                        <li>移動平均・RSI戦略の解析</li>
                      </ul>
                    </div>
                    <div>
                      <p className="font-medium text-blue-700">
                        🚧 短期改善予定 (1-2週間):
                      </p>
                      <ul className="list-disc ml-4 space-y-1">
                        <li>前日データ参照 (lag関数) の実装</li>
                        <li>ショートポジション対応</li>
                        <li>Gemini APIプロンプトの精度向上</li>
                        <li>戦略修正支援機能</li>
                      </ul>
                    </div>
                    <div>
                      <p className="font-medium text-purple-700">
                        🚧 中期改善予定 (1-2ヶ月):
                      </p>
                      <ul className="list-disc ml-4 space-y-1">
                        <li>専用ストップ高関数 (stop_high) の完全実装</li>
                        <li>高度なタイミング制御</li>
                        <li>マルチ銘柄対応</li>
                        <li>独自DSL開発の検討</li>
                      </ul>
                    </div>
                  </div>
                </details>
              </div>
            </div>

            {/* 設定済み戦略の表示 */}
            {strategy && (
              <div className="p-4 border rounded bg-blue-50">
                <div className="flex justify-between items-start mb-3">
                  <h3 className="font-medium text-lg">
                    現在設定されている戦略
                  </h3>
                  <button
                    onClick={() => setStrategy(null)}
                    className="text-red-600 hover:text-red-800 text-sm"
                  >
                    戦略をクリア
                  </button>
                </div>

                <div className="space-y-2 text-sm">
                  {/* 戦略タイプとステータス表示 */}
                  <div className="mb-4 p-3 bg-gray-100 rounded">
                    <div className="flex justify-between items-center">
                      <div>
                        <span className="font-medium text-gray-700">
                          戦略タイプ:{" "}
                        </span>
                        <span className="text-blue-600 font-semibold">
                          {strategyToText(strategy).strategyType}
                        </span>
                      </div>
                      <span className="text-green-600 font-medium">
                        ✓ 設定完了
                      </span>
                    </div>
                    {strategyToText(strategy).interpretation && (
                      <p className="text-gray-600 mt-2 italic">
                        {strategyToText(strategy).interpretation}
                      </p>
                    )}
                  </div>

                  {/* 警告表示 */}
                  {strategyToText(strategy).warnings.length > 0 && (
                    <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded">
                      <p className="font-medium text-yellow-800 mb-2">
                        ⚠️ 戦略分析の警告:
                      </p>
                      {strategyToText(strategy).warnings.map(
                        (warning, index) => (
                          <p
                            key={index}
                            className="text-yellow-700 text-sm mb-1"
                          >
                            • {warning}
                          </p>
                        )
                      )}
                    </div>
                  )}

                  {/* 改善提案表示 */}
                  {strategyToText(strategy).improvements.length > 0 && (
                    <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded">
                      <p className="font-medium text-blue-800 mb-2">
                        💡 改善提案:
                      </p>
                      {strategyToText(strategy).improvements.map(
                        (improvement, index) => (
                          <p key={index} className="text-blue-700 text-sm mb-1">
                            • {improvement}
                          </p>
                        )
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <p className="font-medium text-gray-700">
                        エントリー条件:
                      </p>
                      <p className="text-gray-900 bg-white p-2 rounded border">
                        {strategyToText(strategy).entryCondition}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        タイミング:{" "}
                        {strategy.entry.timing === "next_open"
                          ? "翌営業日の始値"
                          : "当日終値"}
                      </p>
                    </div>

                    <div>
                      <p className="font-medium text-gray-700">
                        エグジット条件:
                      </p>
                      <p className="text-gray-900 bg-white p-2 rounded border">
                        {strategyToText(strategy).exitCondition}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        タイミング:{" "}
                        {strategy.exit.timing === "current_close"
                          ? "当日終値"
                          : strategy.exit.timing}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-blue-200">
                    <p className="font-medium text-gray-700 mb-2">
                      戦略サマリー:
                    </p>
                    <p className="text-gray-900 bg-white p-3 rounded border italic">
                      {strategyToText(strategy).summary}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4 pt-3 border-t border-blue-200">
                    <div>
                      <p className="font-medium text-gray-700">対象銘柄:</p>
                      <p className="text-gray-900">
                        {strategy.universe.join(", ")}
                      </p>
                    </div>
                    <div>
                      <p className="font-medium text-gray-700">初期資金:</p>
                      <p className="text-gray-900">
                        {strategy.cash
                          ? `${strategy.cash.toLocaleString()}円`
                          : "1,000,000円(デフォルト)"}
                      </p>
                    </div>
                    <div>
                      <p className="font-medium text-gray-700">スリッページ:</p>
                      <p className="text-gray-900">
                        {strategy.slippage_bp
                          ? `${strategy.slippage_bp}bp`
                          : "3bp(デフォルト)"}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-blue-200">
                  <button
                    onClick={() => setStep(3)}
                    className="px-6 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                  >
                    この戦略でバックテストを実行
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="text-gray-500">前のステップを完了してください</p>
        )}
      </section>

      {/* Step 3: バックテスト結果 */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">3. バックテスト結果</h2>
        {step >= 3 ? (
          <div className="p-4 border rounded bg-green-50">
            <p className="font-semibold mb-2">✓ バックテスト準備完了</p>
            <p className="text-sm text-gray-600 mb-4">
              データと戦略の準備が完了しました。次はバックテストエンジンの統合を行います。
            </p>
            <div className="space-x-2">
              <button
                onClick={() => {
                  setStep(1);
                  setDataConfig(null);
                  setStrategy(null);
                }}
                className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
              >
                リセット
              </button>
              <button
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                disabled
              >
                バックテスト実行 (実装予定)
              </button>
            </div>
          </div>
        ) : (
          <p className="text-gray-500">前のステップを完了してください</p>
        )}
      </section>
    </div>
  );
}

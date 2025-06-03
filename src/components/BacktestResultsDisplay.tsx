import React from "react";
import { BacktestResponse } from "../types/worker";
import EquityCurveChart from "./EquityCurveChart";

interface Props {
  result: BacktestResponse;
  onNewBacktest: () => void;
}

export function BacktestResultsDisplay({ result, onNewBacktest }: Props) {
  return (
    <div className="space-y-6">
      {/* 簡単なメトリクス表示 */}
      <div
        className="p-4 border rounded bg-white"
        data-testid="metrics-display"
      >
        <h3 className="text-lg font-semibold mb-4">パフォーマンス指標</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="text-center p-4 bg-gray-50 rounded">
            <h4 className="font-medium text-gray-700">年率リターン (CAGR)</h4>
            <p
              className="text-2xl font-bold text-blue-600"
              data-testid="metric-cagr"
            >
              {result.metrics?.cagr
                ? `${(result.metrics.cagr * 100).toFixed(2)}%`
                : "-"}
            </p>
          </div>
          <div className="text-center p-4 bg-gray-50 rounded">
            <h4 className="font-medium text-gray-700">最大ドローダウン</h4>
            <p
              className="text-2xl font-bold text-red-600"
              data-testid="metric-maxdd"
            >
              {result.metrics?.maxDd
                ? `${(result.metrics.maxDd * 100).toFixed(2)}%`
                : "-"}
            </p>
          </div>
          <div className="text-center p-4 bg-gray-50 rounded">
            <h4 className="font-medium text-gray-700">シャープ率</h4>
            <p
              className="text-2xl font-bold text-green-600"
              data-testid="metric-sharpe"
            >
              {result.metrics?.sharpe ? result.metrics.sharpe.toFixed(3) : "-"}
            </p>
          </div>
        </div>
      </div>

      {/* 取引履歴の要約 */}
      <div className="p-4 border rounded bg-white" data-testid="trades-table">
        <h3 className="text-lg font-semibold mb-4">取引履歴</h3>
        <p className="text-gray-600">取引数: {result.trades.length}件</p>
        {result.trades.length > 0 && (
          <div className="mt-4 max-h-64 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="p-2 text-left">銘柄</th>
                  <th className="p-2 text-left">エントリー日</th>
                  <th className="p-2 text-left">エグジット日</th>
                  <th className="p-2 text-right">数量</th>
                  <th className="p-2 text-right">P&L</th>
                </tr>
              </thead>
              <tbody>
                {result.trades.slice(0, 10).map((trade) => (
                  <tr key={trade.id} className="border-t">
                    <td className="p-2">{trade.code}</td>
                    <td className="p-2">{trade.entryDate}</td>
                    <td className="p-2">{trade.exitDate}</td>
                    <td className="p-2 text-right">
                      {trade.qty.toLocaleString()}
                    </td>
                    <td
                      className={`p-2 text-right ${
                        trade.pnl >= 0 ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      ¥{trade.pnl.toFixed(0)}
                    </td>
                  </tr>
                ))}
                {result.trades.length > 10 && (
                  <tr>
                    <td colSpan={5} className="p-2 text-center text-gray-500">
                      他 {result.trades.length - 10} 件
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* エクイティカーブチャート */}
      {result.equityCurve && result.equityCurve.length > 0 && (
        <div className="p-4 border rounded bg-white">
          <h3 className="text-lg font-semibold mb-4">エクイティカーブ</h3>
          <EquityCurveChart equityCurve={result.equityCurve} />
        </div>
      )}

      {/* 警告メッセージ */}
      {result.warnings && result.warnings.length > 0 && (
        <div className="p-4 border rounded bg-yellow-50 border-yellow-200">
          <h3 className="text-lg font-semibold mb-4 text-yellow-800">警告</h3>
          <ul className="list-disc list-inside space-y-1">
            {result.warnings.map((warning, index) => (
              <li key={index} className="text-yellow-700">
                {warning}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 新しいバックテストボタン */}
      <div className="flex justify-center pt-4">
        <button
          onClick={onNewBacktest}
          className="px-6 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          新しいバックテストを実行
        </button>
      </div>
    </div>
  );
}

export default BacktestResultsDisplay;

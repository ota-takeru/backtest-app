import React from "react";
import {
  // StrategyDSL, // StrategyDSLはBacktestRequestのdsl_astとして渡されるので直接は不要かも
  BacktestRequest,
  WorkerMessage,
  // OHLCFrameJSON, // ohlcDataPropの型として使用
  BacktestResponse,
  TradeRow, // TradesTableで使用
  StrategyAST, // BacktestRequestのdsl_astの型として
} from "../types"; // インポートパスを修正
import { v4 as uuidv4 } from "uuid";
import {
  Table,
  tableToIPC,
  makeVector,
  DateDay,
  Float64,
  Int32,
} from "apache-arrow";
import EquityCurveChart from "./EquityCurveChart";
import MetricsDisplay from "./MetricsDisplay";
import TradesTable from "./TradesTable";
import WarningsList from "./WarningsList";

interface Props {
  dsl: StrategyAST; // dslの型をStrategyASTに明示
  codes: string[];
  startDate: string;
  endDate: string;
  apiKey: string;
  ohlcDataProp: Record<string, { index: string[]; data: (number | null)[][] }>; // OHLCFrameJSONの具体的な型に
  onProgressUpdate: (progress: number, message: string) => void;
  backtestResponse: BacktestResponse | null;
  isLoading: boolean; // 親からローディング状態を受け取る
  error: string | null; // 親からエラー情報を受け取る
}

export function BacktestResults({
  dsl,
  codes,
  startDate,
  endDate,
  apiKey,
  ohlcDataProp,
  onProgressUpdate,
  backtestResponse,
  isLoading,
  error,
}: Props) {
  if (isLoading)
    return <p className="text-center py-10">バックテスト実行中...</p>;
  if (error && !backtestResponse)
    return <p className="text-red-500 text-center py-10">エラー: {error}</p>;
  if (!backtestResponse)
    return (
      <p className="text-center py-10">バックテスト結果はまだありません。</p>
    );

  return (
    <div className="space-y-6 p-4" data-testid="backtest-results">
      {error && !backtestResponse.warnings?.includes(error) && (
        <div
          className="p-4 mb-4 text-sm text-red-700 bg-red-100 rounded-lg"
          role="alert"
        >
          <span className="font-medium">実行時エラー:</span> {error}
        </div>
      )}
      {backtestResponse.warnings && backtestResponse.warnings.length > 0 && (
        <WarningsList warnings={backtestResponse.warnings} />
      )}

      <MetricsDisplay metrics={backtestResponse.metrics} />

      <div className="mt-6">
        <h2 className="text-xl font-semibold mb-2">エクイティカーブ</h2>
        <EquityCurveChart equityCurve={backtestResponse.equityCurve} />
      </div>

      <div className="mt-6">
        <h2 className="text-xl font-semibold mb-2">取引履歴</h2>
        <TradesTable trades={backtestResponse.trades} />
      </div>
    </div>
  );
}

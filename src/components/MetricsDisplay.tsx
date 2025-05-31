import React from "react";
import { BacktestResponse } from "../types"; // typesからBacktestResponseをインポート

interface MetricsDisplayProps {
  metrics: BacktestResponse["metrics"];
}

const MetricsDisplay: React.FC<MetricsDisplayProps> = ({ metrics }) => {
  if (!metrics) {
    return <p>メトリクスはありません。</p>;
  }

  const formatPercentage = (value: number | null) => {
    if (value === null) return "-";
    return `${(value * 100).toFixed(2)}%`;
  };

  const formatSharpe = (value: number | null) => {
    if (value === null) return "-";
    return value.toFixed(3);
  };

  return (
    <div className="grid grid-cols-3 gap-4 p-4 bg-gray-100 rounded-lg">
      <div>
        <h3 className="text-sm font-medium text-gray-500">CAGR</h3>
        <p className="mt-1 text-3xl font-semibold text-gray-900">
          {formatPercentage(metrics.cagr)}
        </p>
      </div>
      <div>
        <h3 className="text-sm font-medium text-gray-500">最大ドローダウン</h3>
        <p
          className={`mt-1 text-3xl font-semibold ${
            metrics.maxDd && metrics.maxDd < 0
              ? "text-red-600"
              : "text-gray-900"
          }`}
        >
          {formatPercentage(metrics.maxDd)}
        </p>
      </div>
      <div>
        <h3 className="text-sm font-medium text-gray-500">シャープレシオ</h3>
        <p className="mt-1 text-3xl font-semibold text-gray-900">
          {formatSharpe(metrics.sharpe)}
        </p>
      </div>
    </div>
  );
};

export default MetricsDisplay;

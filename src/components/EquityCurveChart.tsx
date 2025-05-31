import React from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { BacktestResponse } from "../types";

interface EquityCurveChartProps {
  equityCurve: BacktestResponse["equityCurve"];
}

const EquityCurveChart: React.FC<EquityCurveChartProps> = ({ equityCurve }) => {
  if (!equityCurve || equityCurve.length === 0) {
    return (
      <p className="text-center text-gray-500">
        エクイティカーブデータがありません。
      </p>
    );
  }

  // Y軸のドメインを計算 (最小値の95%から最大値の105%程度に)
  const yMin = Math.min(...equityCurve.map((d) => d.equity));
  const yMax = Math.max(...equityCurve.map((d) => d.equity));
  const yDomainMin = Math.floor(yMin * 0.95);
  const yDomainMax = Math.ceil(yMax * 1.05);

  return (
    <div style={{ width: "100%", height: 400 }}>
      <ResponsiveContainer>
        <LineChart
          data={equityCurve}
          margin={{
            top: 5,
            right: 30,
            left: 20,
            bottom: 5,
          }}
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="date"
            angle={-45}
            textAnchor="end"
            height={70}
            tick={{ fontSize: 10 }}
          />
          <YAxis
            domain={[yDomainMin, yDomainMax]}
            tickFormatter={(tick) => tick.toLocaleString()}
            tick={{ fontSize: 10 }}
          />
          <Tooltip formatter={(value: number) => value.toLocaleString()} />
          <Legend />
          <Line
            type="monotone"
            dataKey="equity"
            stroke="#8884d8"
            activeDot={{ r: 8 }}
            dot={{ r: 2 }}
            name="資産"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default EquityCurveChart;

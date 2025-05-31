import React from "react";
import { TradeRow } from "../types";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";

interface TradesTableProps {
  trades: TradeRow[];
}

const columnHelper = createColumnHelper<TradeRow>();

const columns = [
  columnHelper.accessor("date", {
    header: "日付",
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor("side", {
    header: "売買",
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor("price", {
    header: "価格",
    cell: (info) => info.getValue().toFixed(2),
  }),
  columnHelper.accessor("quantity", {
    header: "数量",
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor("pnl", {
    header: "損益(PnL)",
    cell: (info) => {
      const pnl = info.getValue();
      const textColor = pnl >= 0 ? "text-green-600" : "text-red-600";
      return <span className={textColor}>{pnl.toFixed(2)}</span>;
    },
  }),
];

const TradesTable: React.FC<TradesTableProps> = ({ trades }) => {
  const table = useReactTable({
    data: trades,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  if (!trades || trades.length === 0) {
    return <p className="text-center text-gray-500">取引履歴はありません。</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  {header.isPlaceholder
                    ? null
                    : flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id}>
              {row.getVisibleCells().map((cell) => (
                <td
                  key={cell.id}
                  className="px-6 py-4 whitespace-nowrap text-sm text-gray-900"
                >
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default TradesTable;

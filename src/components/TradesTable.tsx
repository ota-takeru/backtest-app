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
    return (
      <p
        className="text-center text-gray-500"
        data-testid="trades-table-no-data"
      >
        取引履歴はありません。
      </p>
    );
  }

  return (
    <div className="overflow-x-auto" data-testid="trades-table">
      <table
        className="min-w-full divide-y divide-gray-200"
        data-testid="trades-table-content"
      >
        <thead className="bg-gray-50" data-testid="trades-table-header">
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  data-testid={`trades-table-header-${header.id}`}
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
        <tbody
          className="bg-white divide-y divide-gray-200"
          data-testid="trades-table-body"
        >
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id} data-testid={`trades-table-row-${row.id}`}>
              {row.getVisibleCells().map((cell) => (
                <td
                  key={cell.id}
                  className="px-6 py-4 whitespace-nowrap text-sm text-gray-900"
                  data-testid={`trades-table-cell-${cell.id}`}
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

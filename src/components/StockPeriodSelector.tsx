import { useState } from "react";
import { StockCodeSelector } from "./StockCodeSelector";
import { DateRangeSelector } from "./DateRangeSelector";
import { getDefaultDateRange, validateDateRange } from "../lib/dateUtils";

interface StockPeriodSelectorProps {
  onSubmit: (codes: string[], start: string, end: string) => void;
  isLoading?: boolean;
}

export function StockPeriodSelector({
  onSubmit,
  isLoading = false,
}: StockPeriodSelectorProps) {
  // Initialize with default values
  const { startDate: defaultStartDate, endDate: defaultEndDate } =
    getDefaultDateRange();

  const [selectedCodes, setSelectedCodes] = useState<string[]>(["7203.T"]);
  const [startDate, setStartDate] = useState(defaultStartDate);
  const [endDate, setEndDate] = useState(defaultEndDate);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (selectedCodes.length === 0) {
      alert("少なくとも1つの銘柄を選択してください。");
      return;
    }

    if (!validateDateRange(startDate, endDate)) {
      alert("開始日は終了日より前の日付を選択してください。");
      return;
    }

    onSubmit(selectedCodes, startDate, endDate);
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4"
      data-testid="stock-period-selector"
    >
      <div data-testid="stock-selector">
        <StockCodeSelector
          selectedCodes={selectedCodes}
          onCodesChange={setSelectedCodes}
        />

        <DateRangeSelector
          startDate={startDate}
          endDate={endDate}
          onStartDateChange={setStartDate}
          onEndDateChange={setEndDate}
        />
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          className="px-6 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
          disabled={selectedCodes.length === 0 || isLoading}
          data-testid="fetch-data-button"
        >
          {isLoading ? "データ取得中..." : "データ取得開始"}
        </button>
      </div>
    </form>
  );
}

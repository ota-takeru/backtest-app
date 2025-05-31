import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { useOhlcData } from "@/hooks/useOhlcData";

interface Props {
  onSubmit: (codes: string[], start: string, end: string) => void;
}

export function StockPeriodSelector({ onSubmit }: Props) {
  const [inputValue, setInputValue] = useState("");
  const [selectedCodes, setSelectedCodes] = useState<string[]>(["7203.T"]);
  // const [codes, setCodes] = useState<string[]>(["7203.T"]); // This seems redundant with selectedCodes

  // J-Quants無料枠に基づくデフォルト日付計算
  const today = new Date();

  // デフォルト終了日: 今日から12週間前
  const defaultEndDateValue = new Date(today);
  defaultEndDateValue.setDate(today.getDate() - 12 * 7); // 12 weeks ago
  const defaultEndDate = defaultEndDateValue.toISOString().split("T")[0];

  // デフォルト開始日: デフォルト終了日から2年前
  const defaultStartDateValue = new Date(defaultEndDateValue);
  defaultStartDateValue.setFullYear(defaultEndDateValue.getFullYear() - 2); // 2 years before defaultEndDate
  const defaultStartDate = defaultStartDateValue.toISOString().split("T")[0];

  const [startDate, setStartDate] = useState(defaultStartDate);
  const [endDate, setEndDate] = useState(defaultEndDate);

  const { triggerRefetch, isLoading: isDataLoading } = useOhlcData();

  const handleAddCode = () => {
    let code = inputValue.trim().toUpperCase();
    if (!code) return;

    // 4桁のみの場合は .T を付与
    if (/^\d{4}$/.test(code)) {
      code = `${code}.T`;
    }

    // バリデーション: 4桁数字 + .T
    if (!/^\d{4}\.T$/.test(code)) {
      alert(
        "銘柄コードは4桁の数字、または 4桁の数字+.T の形式で入力してください（例: 7203 または 7203.T）"
      );
      return;
    }

    if (selectedCodes.includes(code)) {
      alert("この銘柄は既に追加されています");
      return;
    }

    setSelectedCodes((prev) => [...prev, code]);
    setInputValue("");
  };

  const handleRemoveCode = (codeToRemove: string) => {
    setSelectedCodes((prev) => prev.filter((code) => code !== codeToRemove));
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddCode();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedCodes.length === 0) {
      alert("少なくとも1つの銘柄を選択してください。");
      return;
    }
    if (new Date(startDate) >= new Date(endDate)) {
      alert("開始日は終了日より前の日付を選択してください。");
      return;
    }
    onSubmit(selectedCodes, startDate, endDate);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4" data-testid="stock-period-selector">
      <div>
        <h3 className="font-medium mb-2" data-testid="stock-selection-title">銘柄選択</h3>
        <div className="flex space-x-2">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="銘柄コード（例: 7203.T）"
            className="border p-2 flex-1 rounded"
            data-testid="stock-code-input"
          />
          <button
            type="button"
            onClick={handleAddCode}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            data-testid="add-stock-button"
          >
            追加
          </button>
        </div>

        {selectedCodes.length > 0 && (
          <div className="border rounded p-2 mt-2">
            <div className="flex flex-wrap gap-2">
              {selectedCodes.map((code) => (
                <span
                  key={code}
                  className="inline-flex items-center bg-gray-100 px-2 py-1 rounded"
                >
                  {code}
                  <button
                    type="button"
                    onClick={() => handleRemoveCode(code)}
                    className="ml-2 text-gray-500 hover:text-red-500"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="startDate" className="block font-medium mb-1">
            開始日:
          </label>
          <input
            type="date"
            id="startDate"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="border p-2 w-full rounded"
            required
            data-testid="start-date-input"
          />
        </div>

        <div>
          <label htmlFor="endDate" className="block font-medium mb-1">
            終了日:
          </label>
          <input
            type="date"
            id="endDate"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="border p-2 w-full rounded"
            required
            data-testid="end-date-input"
          />
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          className="px-6 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
          disabled={selectedCodes.length === 0}
          data-testid="fetch-data-button"
        >
          データ取得開始
        </button>
      </div>
    </form>
  );
}

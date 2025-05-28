import { useState } from "react";

interface Props {
  universe: string[];
  onConfirm: (
    selectedCodes: string[],
    startDate: string,
    endDate: string
  ) => void;
  onCancel: () => void;
}

export function UniversePeriodDialog({ universe, onConfirm, onCancel }: Props) {
  const [selectedCodes, setSelectedCodes] = useState<string[]>(universe);
  const [startDate, setStartDate] = useState("2020-01-01");
  const [endDate, setEndDate] = useState(
    new Date().toISOString().split("T")[0]
  );

  const handleCodeToggle = (code: string) => {
    setSelectedCodes((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedCodes.length === 0) {
      alert("少なくとも1つの銘柄を選択してください。");
      return;
    }
    onConfirm(selectedCodes, startDate, endDate);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
      <form
        onSubmit={handleSubmit}
        className="bg-white p-6 rounded-lg shadow-xl w-full max-w-md space-y-4"
      >
        <h2 className="text-xl font-semibold">銘柄と期間を選択</h2>

        <div>
          <label className="block font-medium mb-1">
            銘柄 (DSLで定義されたユニバース):
          </label>
          <div className="max-h-40 overflow-y-auto border rounded p-2 space-y-1">
            {universe.map((code) => (
              <label
                key={code}
                className="flex items-center space-x-2 p-1 hover:bg-gray-100 rounded cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selectedCodes.includes(code)}
                  onChange={() => handleCodeToggle(code)}
                  className="form-checkbox h-4 w-4 text-blue-600"
                />
                <span>{code}</span>
              </label>
            ))}
          </div>
        </div>

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
          />
        </div>

        <div className="flex justify-end space-x-2 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 border rounded text-gray-700 hover:bg-gray-100"
          >
            キャンセル
          </button>
          <button
            type="submit"
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            disabled={selectedCodes.length === 0}
          >
            実行
          </button>
        </div>
      </form>
    </div>
  );
}

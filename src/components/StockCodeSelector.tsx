import { useState } from "react";

interface StockCodeSelectorProps {
  selectedCodes: string[];
  onCodesChange: (codes: string[]) => void;
}

export function StockCodeSelector({
  selectedCodes,
  onCodesChange,
}: StockCodeSelectorProps) {
  const [inputValue, setInputValue] = useState("");

  const validateStockCode = (code: string): string | null => {
    // 4桁のみの場合は .T を付与
    if (/^\d{4}$/.test(code)) {
      return `${code}.T`;
    }

    // バリデーション: 4桁数字 + .T
    if (!/^\d{4}\.T$/.test(code)) {
      return null;
    }

    return code;
  };

  const handleAddCode = () => {
    const trimmedCode = inputValue.trim().toUpperCase();
    if (!trimmedCode) return;

    const validatedCode = validateStockCode(trimmedCode);
    if (!validatedCode) {
      alert(
        "銘柄コードは4桁の数字、または 4桁の数字+.T の形式で入力してください（例: 7203 または 7203.T）"
      );
      return;
    }

    if (selectedCodes.includes(validatedCode)) {
      alert("この銘柄は既に追加されています");
      return;
    }

    onCodesChange([...selectedCodes, validatedCode]);
    setInputValue("");
  };

  const handleRemoveCode = (codeToRemove: string) => {
    onCodesChange(selectedCodes.filter((code) => code !== codeToRemove));
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddCode();
    }
  };

  return (
    <div>
      <h3 className="font-medium mb-2" data-testid="stock-selection-title">
        銘柄選択
      </h3>
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
  );
}

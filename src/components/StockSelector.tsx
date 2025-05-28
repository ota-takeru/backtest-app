import { useState } from "react";

interface Props {
  onCodesChange: (codes: string[]) => void;
}

export function StockSelector({ onCodesChange }: Props) {
  const [inputValue, setInputValue] = useState("");
  const [selectedCodes, setSelectedCodes] = useState<string[]>([]);

  const handleAddCode = () => {
    const code = inputValue.trim().toUpperCase();
    if (!code) return;

    // 基本的なバリデーション（4桁の数字 + .T）
    if (!/^\d{4}\.T$/.test(code)) {
      alert(
        "銘柄コードは「4桁の数字 + .T」の形式で入力してください（例: 7203.T）"
      );
      return;
    }

    if (selectedCodes.includes(code)) {
      alert("この銘柄は既に追加されています");
      return;
    }

    const newCodes = [...selectedCodes, code];
    setSelectedCodes(newCodes);
    onCodesChange(newCodes);
    setInputValue("");
  };

  const handleRemoveCode = (codeToRemove: string) => {
    const newCodes = selectedCodes.filter((code) => code !== codeToRemove);
    setSelectedCodes(newCodes);
    onCodesChange(newCodes);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddCode();
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex space-x-2">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="銘柄コード（例: 7203.T）"
          className="border p-2 flex-1 rounded"
        />
        <button
          onClick={handleAddCode}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          追加
        </button>
      </div>

      {selectedCodes.length > 0 && (
        <div className="border rounded p-2">
          <h3 className="font-medium mb-2">選択中の銘柄:</h3>
          <div className="flex flex-wrap gap-2">
            {selectedCodes.map((code) => (
              <span
                key={code}
                className="inline-flex items-center bg-gray-100 px-2 py-1 rounded"
              >
                {code}
                <button
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

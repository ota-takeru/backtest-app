import { useState } from "react";
import { useApiKeys } from "../hooks/useApiKeys";

interface Props {
  onSave: (jquantsKey: string) => void;
}

export function ApiKeyForm({ onSave }: Props) {
  const { keys, updateKeys } = useApiKeys();
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(keys.jquants);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block font-medium mb-1">J-Quants API Key</label>
        <div className="flex space-x-2">
          <input
            value={keys.jquants}
            onChange={(e) => updateKeys({ jquants: e.target.value })}
            className="border p-2 flex-1 rounded"
            placeholder="J-Quants API Key"
            required
          />
          <button
            type="submit"
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            保存
          </button>
        </div>
      </div>

      <div>
        <button
          type="button"
          onClick={() => setIsAdvancedOpen(!isAdvancedOpen)}
          className="text-blue-600 hover:text-blue-800"
        >
          {isAdvancedOpen ? "▼" : "▶"} LLM API Keys の設定
        </button>

        {isAdvancedOpen && (
          <div className="mt-2 space-y-4 border-l-2 border-blue-200 pl-4">
            <div>
              <label className="block font-medium mb-1">
                OpenAI API Key
                <span className="text-sm text-gray-600 ml-2">
                  ※ 環境変数 VITE_OPENAI_API_KEY で設定可能
                </span>
              </label>
              <input
                type="password"
                value={keys.openai}
                onChange={(e) => updateKeys({ openai: e.target.value })}
                className="border p-2 w-full rounded"
                placeholder="OpenAI API Key"
              />
            </div>

            <div>
              <label className="block font-medium mb-1">
                Gemini API Key
                <span className="text-sm text-gray-600 ml-2">
                  ※ 環境変数 VITE_GEMINI_API_KEY で設定可能
                </span>
              </label>
              <input
                type="password"
                value={keys.gemini}
                onChange={(e) => updateKeys({ gemini: e.target.value })}
                className="border p-2 w-full rounded"
                placeholder="Gemini API Key"
              />
            </div>
          </div>
        )}
      </div>
    </form>
  );
}

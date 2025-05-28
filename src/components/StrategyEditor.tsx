import { useState } from "react";
import { buildStrategyFromPrompt as buildWithOpenAI } from "../lib/openaiClient";
import { buildStrategyFromPrompt as buildWithGemini } from "../lib/geminiClient";
import { StrategyDSL } from "../lib/types";

interface Props {
  onValidated: (dsl: StrategyDSL) => void;
  selectedStockCodes: string[];
}

export function StrategyEditor({ onValidated, selectedStockCodes }: Props) {
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [provider, setProvider] = useState<string>(
    () => sessionStorage.getItem("llm_provider") ?? "openai"
  );

  const handleValidate = async () => {
    if (!input.trim()) {
      setError("戦略を入力してください。");
      return;
    }

    setIsLoading(true);
    setError(null);
    sessionStorage.setItem("llm_provider", provider);

    try {
      const res =
        provider === "gemini"
          ? await buildWithGemini(input, selectedStockCodes)
          : await buildWithOpenAI(input);

      if (res.ok) {
        onValidated(res.strategy);
      } else {
        setError(res.error);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center space-x-4">
        <select
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
          className="border p-2 rounded"
        >
          <option value="openai">OpenAI</option>
          <option value="gemini">Gemini</option>
        </select>
        <div className="text-sm text-gray-600">
          ※ LLMを使用して日本語の戦略をDSLに変換します
        </div>
      </div>

      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        rows={6}
        className="border p-2 w-full rounded"
        placeholder="例: 25日移動平均線を5日移動平均線が上抜けたら買い、下抜けたら売る。損切りは10%とする。"
      />

      {error && <p className="text-red-600">{error}</p>}

      <div className="flex justify-end">
        <button
          onClick={handleValidate}
          disabled={isLoading || !input.trim()}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {isLoading ? "検証中..." : "戦略を検証"}
        </button>
      </div>
    </div>
  );
}

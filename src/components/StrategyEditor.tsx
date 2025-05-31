import { useState } from "react";
import { buildStrategyFromPrompt as buildWithOpenAI } from "../lib/openaiClient";
import { buildStrategyFromPrompt as buildWithGemini } from "../lib/geminiClient";
import { StrategyAST } from "../types";

interface Props {
  onStrategySubmit: (dsl: StrategyAST) => void;
  apiKey?: string;
}

export function StrategyEditor({ onStrategySubmit, apiKey }: Props) {
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [provider, setProvider] = useState<string>(
    () => sessionStorage.getItem("llm_provider") ?? "openai"
  );

  const handleSubmit = async () => {
    if (!input.trim()) {
      setError("戦略を入力してください。");
      return;
    }
    if (!apiKey && provider === "openai") {
      setError("OpenAI APIキーが設定されていません。");
      return;
    }

    setIsLoading(true);
    setError(null);
    sessionStorage.setItem("llm_provider", provider);

    try {
      const res =
        provider === "gemini"
          ? await buildWithGemini(input, apiKey || "")
          : await buildWithOpenAI(input, apiKey || "");

      if (res.ok && res.strategy) {
        onStrategySubmit(res.strategy as StrategyAST);
      } else if (!res.ok) {
        setError(res.error || "戦略の生成に失敗しました。");
      }
    } catch (err: any) {
      setError(err.message || String(err));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-white shadow sm:rounded-lg p-6" data-testid="strategy-editor">
      <div className="flex items-center justify-between mb-4">
        <label
          htmlFor="llm-provider"
          className="block text-sm font-medium text-gray-700"
        >
          LLMプロバイダー選択:
        </label>
        <select
          id="llm-provider"
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
          className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
        >
          <option value="openai">OpenAI (GPT-4 etc.)</option>
          <option value="gemini">Google Gemini</option>
        </select>
      </div>

      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        rows={6}
        data-testid="strategy-input"
        className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md p-3"
        placeholder="例: 14日RSIが30未満で買い、70より大きい場合に売り。対象銘柄は7203.T。初期資金100万円、スリッページ3bp。"
      />
      <div className="text-xs text-gray-500 mt-1 mb-3">
        ヒント: 銘柄コード (例:
        7203.T)、初期資金、スリッページなども含めるとより正確な戦略が生成されます。
      </div>

      {error && <p className="text-sm text-red-600 my-2" data-testid="strategy-error">{error}</p>}

      <div className="flex justify-end mt-4">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isLoading || !input.trim()}
          data-testid="strategy-submit"
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-gray-400"
        >
          {isLoading ? "戦略を生成・検証中..." : "戦略を生成・検証"}
        </button>
      </div>
    </div>
  );
}

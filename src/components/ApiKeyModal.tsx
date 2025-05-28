import { useState, useEffect } from "react";
import { useApiKeys, ApiKeys as ApiKeysType } from "../hooks/useApiKeys";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function ApiKeyModal({ isOpen, onClose }: Props) {
  const { keys, updateKeys } = useApiKeys();
  const [localKeys, setLocalKeys] = useState<ApiKeysType>(keys);

  useEffect(() => {
    setLocalKeys(keys); // Sync with global state when modal opens or keys change externally
  }, [keys, isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    // Only update keys that are meant to be user-settable from this modal
    updateKeys({
      gemini: localKeys.gemini,
      openai: localKeys.openai,
      jquants_refresh: localKeys.jquants_refresh,
      // jquants_id is managed by the refresh mechanism, not directly set by user here
    });
    onClose();
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    keyName: keyof Pick<ApiKeysType, "gemini" | "openai" | "jquants_refresh"> // Limit settable keys
  ) => {
    setLocalKeys((prev) => ({ ...prev, [keyName]: e.target.value }));
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-lg space-y-4">
        <h2 className="text-xl font-semibold">APIキー設定</h2>

        <div>
          <label className="block font-medium mb-1">
            J-Quants Refresh Token
          </label>
          <input
            type="password"
            value={localKeys.jquants_refresh}
            onChange={(e) => handleChange(e, "jquants_refresh")}
            className="border p-2 w-full rounded"
            placeholder="J-Quants Refresh Token"
          />
          <p className="text-xs text-gray-500 mt-1">
            ※必須。IDトークンの自動更新に利用されます。
          </p>
        </div>

        <div>
          <label className="block font-medium mb-1">
            J-Quants ID Token (自動取得)
          </label>
          <input
            type="text" // Show as text, but read-only
            value={localKeys.jquants_id || "-"} // Display current ID token or placeholder
            readOnly
            className="border p-2 w-full rounded bg-gray-100 cursor-not-allowed"
            placeholder="ID Token (自動更新されます)"
          />
          <p className="text-xs text-gray-500 mt-1">
            ※Refresh Token設定後、APIアクセス時に自動で取得・更新されます。
          </p>
        </div>

        <div>
          <label className="block font-medium mb-1">OpenAI API Key</label>
          <input
            type="password"
            value={localKeys.openai}
            onChange={(e) => handleChange(e, "openai")}
            className="border p-2 w-full rounded"
            placeholder="OpenAI API Key (任意)"
          />
          <p className="text-xs text-gray-500 mt-1">
            ※ 環境変数 VITE_OPENAI_API_KEY でも設定可能
          </p>
        </div>

        <div>
          <label className="block font-medium mb-1">Gemini API Key</label>
          <input
            type="password"
            value={localKeys.gemini}
            onChange={(e) => handleChange(e, "gemini")}
            className="border p-2 w-full rounded"
            placeholder="Gemini API Key (任意)"
          />
          <p className="text-xs text-gray-500 mt-1">
            ※ 環境変数 VITE_GEMINI_API_KEY でも設定可能
          </p>
        </div>

        <div className="flex justify-end space-x-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border rounded text-gray-700 hover:bg-gray-100"
          >
            キャンセル
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            保存して閉じる
          </button>
        </div>
      </div>
    </div>
  );
}

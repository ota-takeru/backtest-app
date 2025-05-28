import { useState, useEffect } from "react";

export interface ApiKeys {
  gemini: string;
  openai: string;
  jquants_refresh: string; // J-Quants Refresh Token
  jquants_id: string; // J-Quants ID Token (fetched using refresh token)
}

export function useApiKeys() {
  const [keys, setKeys] = useState<ApiKeys>(() => ({
    gemini:
      sessionStorage.getItem("gemini_api_key") ||
      import.meta.env.VITE_GEMINI_API_KEY ||
      "",
    openai:
      sessionStorage.getItem("openai_api_key") ||
      import.meta.env.VITE_OPENAI_API_KEY ||
      "",
    jquants_refresh:
      sessionStorage.getItem("jquants_refresh_token") || // Use new key for refresh token
      import.meta.env.VITE_JQUANTS_REFRESH_TOKEN || // Environment variable for refresh token
      "",
    jquants_id:
      sessionStorage.getItem("jquants_id_token") || // ID token also from session or env (less common for id token)
      import.meta.env.VITE_JQUANTS_ID_TOKEN ||
      "",
  }));

  // Save keys to sessionStorage when they change
  useEffect(() => {
    if (keys.gemini) sessionStorage.setItem("gemini_api_key", keys.gemini);
    if (keys.openai) sessionStorage.setItem("openai_api_key", keys.openai);
    if (keys.jquants_refresh)
      sessionStorage.setItem("jquants_refresh_token", keys.jquants_refresh);
    if (keys.jquants_id)
      sessionStorage.setItem("jquants_id_token", keys.jquants_id);
  }, [keys]);

  const updateKeys = (newKeys: Partial<ApiKeys>) => {
    setKeys((prev) => ({ ...prev, ...newKeys }));
  };

  return {
    keys,
    updateKeys,
    // Helper functions for individual keys - adjust or add as needed
    updateGeminiKey: (key: string) => updateKeys({ gemini: key }),
    updateOpenAIKey: (key: string) => updateKeys({ openai: key }),
    updateJQuantsRefresh: (key: string) => updateKeys({ jquants_refresh: key }),
    updateJQuantsId: (key: string) => updateKeys({ jquants_id: key }),
  };
}

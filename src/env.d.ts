/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GEMINI_API_KEY?: string;
  readonly VITE_OPENAI_API_KEY?: string;
  readonly VITE_JQUANTS_REFRESH_TOKEN?: string;
  readonly VITE_JQUANTS_ID_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

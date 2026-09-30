/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Endereço da API quando a interface é publicada separada dela (ex.: Vercel). */
  readonly VITE_API_URL?: string;
  /** "true": demonstração só-interface, sem API (dados de exemplo no navegador). */
  readonly VITE_DEMO?: string;
}

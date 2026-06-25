/// <reference types="vite/client" />

interface Window {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ethereum?: any;
}

interface ImportMetaEnv {
  readonly VITE_PIMLICO_API_KEY?: string;
  readonly VITE_SEPOLIA_RPC_URL?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}

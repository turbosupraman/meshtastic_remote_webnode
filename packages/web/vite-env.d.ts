/// <reference types="vite/client" />

interface ViteTypeOptions {
  strictImportMetaEnv: unknown;
}

interface ImportMetaEnv {
  readonly VITE_COMMIT_HASH: string;
  readonly VITE_VERSION: string;
  readonly VITE_DEFAULT_MESHTASTIC_URL?: string;
  readonly VITE_DEFAULT_MESHTASTIC_AUTOCONNECT?: string;
  readonly VITE_DEFAULT_MESHTASTIC_ALERT_ON_FAIL?: string;
  readonly VITE_HISTORY_SYNC_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

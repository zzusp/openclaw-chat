/**
 * OpenClaw Chat channel plugin — type definitions.
 */

/** Per-account configuration stored in clawdbot.json channels.openclawChat */
export type OpenclawChatAccountConfig = {
  /** Optional display name for this account. */
  name?: string;
  /** If false, do not start this account. Default: true. */
  enabled?: boolean;
  /** WebSocket host to bind. Default: 0.0.0.0 */
  host?: string;
  /** WebSocket port to bind. Default: 8787 */
  port?: number;
  /** WebSocket path. Default: /openclaw-chat */
  path?: string;
  /** Optional auth token required by clients. */
  authToken?: string;
  /** Direct message access policy (default: pairing). */
  dmPolicy?: "pairing" | "allowlist" | "open" | "disabled";
  /** Allowlist for DM senders (clientId). */
  allowFrom?: Array<string | number>;
  /** Max inbound media size in MB (for future use). */
  mediaMaxMb?: number;
  /** Enable local JSON history storage. Default: true. */
  historyEnabled?: boolean;
  /** History JSON file path or directory (per-account file will be created). */
  historyPath?: string;
  /** Max messages kept per conversation. Default: 5000. */
  historyMaxMessages?: number;
};

/** Top-level OpenClaw Chat config section (channels.openclawChat). */
export type OpenclawChatConfig = {
  /** Multi-account map. */
  accounts?: Record<string, OpenclawChatAccountConfig>;
  /** Default account ID when multiple accounts exist. */
  defaultAccount?: string;
} & OpenclawChatAccountConfig;

/** How the auth token was resolved. */
export type OpenclawChatTokenSource = "config" | "plugin" | "none";

/** Resolved account ready for use. */
export type ResolvedOpenclawChatAccount = {
  accountId: string;
  name?: string;
  enabled: boolean;
  host: string;
  port: number;
  path: string;
  authToken: string;
  tokenSource: OpenclawChatTokenSource;
  config: OpenclawChatAccountConfig;
};

/** Result of sending a message. */
export type OpenclawChatSendResult = {
  ok: boolean;
  messageId?: string;
  error?: string;
};

/** Probe result. */
export type OpenclawChatProbeResult = {
  ok: boolean;
  error?: string;
  elapsedMs: number;
};

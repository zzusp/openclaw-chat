/**
 * OpenClaw Chat account resolution — multi-account support.
 */

import type { ClawdbotConfig } from "clawdbot/plugin-sdk";
import { DEFAULT_ACCOUNT_ID, normalizeAccountId } from "./sdk.js";

import type {
  OpenclawChatAccountConfig,
  OpenclawChatConfig,
  ResolvedOpenclawChatAccount,
} from "./types.js";

const DEFAULT_HOST = "0.0.0.0";
const DEFAULT_PORT = 8787;
const DEFAULT_PATH = "/openclaw-chat";

function listConfiguredAccountIds(cfg: ClawdbotConfig): string[] {
  const accounts = (cfg.channels?.openclawChat as OpenclawChatConfig | undefined)?.accounts;
  if (!accounts || typeof accounts !== "object") return [];
  return Object.keys(accounts).filter(Boolean);
}

/** List all configured OpenClaw Chat account IDs (falls back to ["default"]). */
export function listOpenclawChatAccountIds(cfg: ClawdbotConfig): string[] {
  const ids = listConfiguredAccountIds(cfg);
  if (ids.length === 0) return [DEFAULT_ACCOUNT_ID];
  return ids.sort((a, b) => a.localeCompare(b));
}

/** Resolve the default account ID. */
export function resolveDefaultOpenclawChatAccountId(cfg: ClawdbotConfig): string {
  const ocConfig = cfg.channels?.openclawChat as OpenclawChatConfig | undefined;
  if (ocConfig?.defaultAccount?.trim()) return ocConfig.defaultAccount.trim();
  const ids = listOpenclawChatAccountIds(cfg);
  if (ids.includes(DEFAULT_ACCOUNT_ID)) return DEFAULT_ACCOUNT_ID;
  return ids[0] ?? DEFAULT_ACCOUNT_ID;
}

function resolveAccountConfig(
  cfg: ClawdbotConfig,
  accountId: string,
): OpenclawChatAccountConfig | undefined {
  const accounts = (cfg.channels?.openclawChat as OpenclawChatConfig | undefined)?.accounts;
  if (!accounts || typeof accounts !== "object") return undefined;
  return accounts[accountId] as OpenclawChatAccountConfig | undefined;
}

function mergeAccountConfig(cfg: ClawdbotConfig, accountId: string): OpenclawChatAccountConfig {
  const raw = (cfg.channels?.openclawChat ?? {}) as OpenclawChatConfig;
  const { accounts: _ignored, defaultAccount: _ignored2, ...base } = raw;
  const account = resolveAccountConfig(cfg, accountId) ?? {};
  return { ...base, ...account };
}

function resolveAuthToken(
  cfg: ClawdbotConfig,
  merged: OpenclawChatAccountConfig,
): { authToken: string; source: "config" | "plugin" | "none" } {
  if (merged.authToken?.trim()) {
    return { authToken: merged.authToken.trim(), source: "config" };
  }

  const pluginCfg = (cfg as Record<string, unknown>).plugins as
    | { entries?: Record<string, { config?: Record<string, string> }> }
    | undefined;
  const ocPluginCfg = pluginCfg?.entries?.["openclaw-chat"]?.config;
  const token = ocPluginCfg?.authToken?.trim();
  if (token) {
    return { authToken: token, source: "plugin" };
  }

  return { authToken: "", source: "none" };
}

function resolveServerSettings(
  cfg: ClawdbotConfig,
  merged: OpenclawChatAccountConfig,
): { host: string; port: number; path: string } {
  const pluginCfg = (cfg as Record<string, unknown>).plugins as
    | { entries?: Record<string, { config?: Record<string, string | number> }> }
    | undefined;
  const ocPluginCfg = pluginCfg?.entries?.["openclaw-chat"]?.config ?? {};

  const host = String(
    merged.host?.trim() || ocPluginCfg.host || DEFAULT_HOST,
  );
  const portRaw = merged.port ?? ocPluginCfg.port ?? DEFAULT_PORT;
  const port = typeof portRaw === "number" ? portRaw : Number(portRaw);
  let path = String(
    merged.path?.trim() || ocPluginCfg.path || DEFAULT_PATH,
  );
  if (!path.startsWith("/")) path = `/${path}`;

  return { host, port: Number.isFinite(port) ? port : DEFAULT_PORT, path };
}

/** Fully resolve an OpenClaw Chat account. */
export function resolveOpenclawChatAccount(params: {
  cfg: ClawdbotConfig;
  accountId?: string | null;
}): ResolvedOpenclawChatAccount {
  const accountId = normalizeAccountId(params.accountId);
  const baseEnabled =
    (params.cfg.channels?.openclawChat as OpenclawChatConfig | undefined)?.enabled !== false;
  const merged = mergeAccountConfig(params.cfg, accountId);
  const accountEnabled = merged.enabled !== false;
  const enabled = baseEnabled && accountEnabled;
  const token = resolveAuthToken(params.cfg, merged);
  const server = resolveServerSettings(params.cfg, merged);

  return {
    accountId,
    name: merged.name?.trim() || undefined,
    enabled,
    host: server.host,
    port: server.port,
    path: server.path,
    authToken: token.authToken,
    tokenSource: token.source,
    config: merged,
  };
}

/** List all enabled OpenClaw Chat accounts. */
export function listEnabledOpenclawChatAccounts(cfg: ClawdbotConfig): ResolvedOpenclawChatAccount[] {
  return listOpenclawChatAccountIds(cfg)
    .map((accountId) => resolveOpenclawChatAccount({ cfg, accountId }))
    .filter((account) => account.enabled);
}

export const defaults = {
  host: DEFAULT_HOST,
  port: DEFAULT_PORT,
  path: DEFAULT_PATH,
};

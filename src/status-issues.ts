/**
 * Diagnostic issues collector for OpenClaw Chat channel.
 */

import type { ChannelAccountSnapshot, ChannelStatusIssue } from "clawdbot/plugin-sdk";

type OpenclawChatAccountStatus = {
  accountId?: unknown;
  enabled?: unknown;
  configured?: unknown;
  dmPolicy?: unknown;
  authToken?: unknown;
  port?: unknown;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object");

const asString = (value: unknown): string | undefined =>
  typeof value === "string" ? value : typeof value === "number" ? String(value) : undefined;

function readAccountStatus(value: ChannelAccountSnapshot): OpenclawChatAccountStatus | null {
  if (!isRecord(value)) return null;
  return {
    accountId: value.accountId,
    enabled: value.enabled,
    configured: value.configured,
    dmPolicy: value.dmPolicy,
    authToken: value.authToken,
    port: value.port,
  };
}

/** Collect configuration issues for all OpenClaw Chat accounts. */
export function collectOpenclawChatStatusIssues(
  accounts: ChannelAccountSnapshot[],
): ChannelStatusIssue[] {
  const issues: ChannelStatusIssue[] = [];

  for (const entry of accounts) {
    const account = readAccountStatus(entry);
    if (!account) continue;
    const accountId = asString(account.accountId) ?? "default";
    const enabled = account.enabled !== false;
    const configured = account.configured === true;

    if (enabled && !configured) {
      issues.push({
        channel: "openclawChat",
        accountId,
        kind: "config",
        message: "OpenClaw Chat account is enabled but not configured (missing port).",
        fix: "Set channels.openclawChat.port in clawdbot.json.",
      });
    }

    if (enabled && configured && account.dmPolicy === "open") {
      issues.push({
        channel: "openclawChat",
        accountId,
        kind: "config",
        message:
          'OpenClaw Chat dmPolicy is "open", allowing any clientId to message the bot without pairing.',
        fix: 'Set channels.openclawChat.dmPolicy to "pairing" or "allowlist" to restrict access.',
      });
    }

    if (enabled && configured && !account.authToken) {
      issues.push({
        channel: "openclawChat",
        accountId,
        kind: "config",
        message: "OpenClaw Chat is running without authToken. Anyone on the network can connect.",
        fix: "Set channels.openclawChat.authToken to require a shared token.",
      });
    }
  }

  return issues;
}

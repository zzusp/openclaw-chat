/**
 * OpenClaw Chat ChannelPlugin + ChannelDock — core channel integration.
 */

import type {
  ChannelAccountSnapshot,
  ChannelDock,
  ChannelPlugin,
  ClawdbotConfig,
} from "clawdbot/plugin-sdk";
import {
  applyAccountNameToChannelSection,
  DEFAULT_ACCOUNT_ID,
  deleteAccountFromConfigSection,
  formatPairingApproveHint,
  migrateBaseNameToDefaultAccount,
  normalizeAccountId,
  PAIRING_APPROVED_MESSAGE,
  setAccountEnabledInConfigSection,
} from "./sdk.js";

import {
  defaults,
  listOpenclawChatAccountIds,
  resolveDefaultOpenclawChatAccountId,
  resolveOpenclawChatAccount,
} from "./accounts.js";
import type { ResolvedOpenclawChatAccount } from "./types.js";
import { OpenclawChatConfigJsonSchema } from "./config-json-schema.js";
import { openclawChatOnboardingAdapter } from "./onboarding.js";
import { probeOpenclawChat } from "./probe.js";
import { sendMediaMessage, sendSystemMessage, sendTextMessage } from "./send.js";
import { collectOpenclawChatStatusIssues } from "./status-issues.js";
import { startOpenclawChatProvider } from "./receive.js";

const meta = {
  id: "openclawChat",
  label: "OpenClaw Chat",
  selectionLabel: "OpenClaw Chat",
  docsPath: "/channels/openclaw-chat",
  docsLabel: "openclaw-chat",
  blurb: "WebSocket bridge for OpenClaw Chat (iOS app or web client).",
  aliases: ["occhat", "ios"],
  order: 90,
  quickstartAllowFrom: true,
};

function normalizeOpenclawChatTarget(raw: string): string | undefined {
  const trimmed = raw?.trim();
  if (!trimmed) return undefined;
  return trimmed.replace(/^(openclawchat|openclaw-chat|occhat|ios):/i, "");
}

export const openclawChatDock: ChannelDock = {
  id: "openclawChat",
  capabilities: {
    chatTypes: ["direct", "group"],
    media: true,
    blockStreaming: true,
  },
  outbound: { textChunkLimit: 4000 },
  config: {
    resolveAllowFrom: ({ cfg, accountId }) =>
      (resolveOpenclawChatAccount({ cfg: cfg as ClawdbotConfig, accountId }).config.allowFrom ?? []).map(
        (entry) => String(entry),
      ),
    formatAllowFrom: ({ allowFrom }) =>
      allowFrom
        .map((entry) => String(entry).trim())
        .filter(Boolean)
        .map((entry) => entry.replace(/^(openclawchat|openclaw-chat|occhat|ios):/i, ""))
        .map((entry) => entry.toLowerCase()),
  },
  groups: {
    resolveRequireMention: () => false,
  },
  threading: {
    resolveReplyToMode: () => "off",
  },
};

export const openclawChatPlugin: ChannelPlugin<ResolvedOpenclawChatAccount> = {
  id: "openclawChat",
  meta,
  onboarding: openclawChatOnboardingAdapter,
  capabilities: {
    chatTypes: ["direct", "group"],
    media: true,
    reactions: false,
    threads: false,
    polls: false,
    nativeCommands: false,
    blockStreaming: true,
  },
  reload: { configPrefixes: ["channels.openclawChat"] },
  configSchema: { schema: OpenclawChatConfigJsonSchema },
  config: {
    listAccountIds: (cfg) => listOpenclawChatAccountIds(cfg as ClawdbotConfig),
    resolveAccount: (cfg, accountId) =>
      resolveOpenclawChatAccount({ cfg: cfg as ClawdbotConfig, accountId }),
    defaultAccountId: (cfg) => resolveDefaultOpenclawChatAccountId(cfg as ClawdbotConfig),
    setAccountEnabled: ({ cfg, accountId, enabled }) =>
      setAccountEnabledInConfigSection({
        cfg: cfg as ClawdbotConfig,
        sectionKey: "openclawChat",
        accountId,
        enabled,
        allowTopLevel: true,
      }),
    deleteAccount: ({ cfg, accountId }) =>
      deleteAccountFromConfigSection({
        cfg: cfg as ClawdbotConfig,
        sectionKey: "openclawChat",
        accountId,
        clearBaseFields: ["host", "port", "path", "authToken", "name"],
      }),
    isConfigured: (account) => Boolean(account.port),
    describeAccount: (account): ChannelAccountSnapshot => ({
      accountId: account.accountId,
      name: account.name,
      enabled: account.enabled,
      configured: Boolean(account.port),
      tokenSource: account.tokenSource,
      host: account.host,
      port: account.port,
      path: account.path,
      authToken: account.authToken ? true : false,
    }),
    resolveAllowFrom: ({ cfg, accountId }) =>
      (resolveOpenclawChatAccount({ cfg: cfg as ClawdbotConfig, accountId }).config.allowFrom ?? []).map(
        (entry) => String(entry),
      ),
    formatAllowFrom: ({ allowFrom }) =>
      allowFrom
        .map((entry) => String(entry).trim())
        .filter(Boolean)
        .map((entry) => entry.replace(/^(openclawchat|openclaw-chat|occhat|ios):/i, ""))
        .map((entry) => entry.toLowerCase()),
  },
  security: {
    resolveDmPolicy: ({ cfg, accountId, account }) => {
      const resolvedAccountId = accountId ?? account.accountId ?? DEFAULT_ACCOUNT_ID;
      const useAccountPath = Boolean(
        (cfg as ClawdbotConfig).channels?.openclawChat?.accounts?.[resolvedAccountId],
      );
      const basePath = useAccountPath
        ? `channels.openclawChat.accounts.${resolvedAccountId}.`
        : "channels.openclawChat.";
      return {
        policy: account.config.dmPolicy ?? "pairing",
        allowFrom: account.config.allowFrom ?? [],
        policyPath: `${basePath}dmPolicy`,
        allowFromPath: basePath,
        approveHint: formatPairingApproveHint("openclawChat"),
        normalizeEntry: (raw: string) => raw.replace(/^(openclawchat|openclaw-chat|occhat|ios):/i, ""),
      };
    },
  },
  groups: {
    resolveRequireMention: () => false,
  },
  threading: {
    resolveReplyToMode: () => "off",
  },
  messaging: {
    normalizeTarget: normalizeOpenclawChatTarget,
    targetResolver: {
      looksLikeId: (raw) => Boolean(raw.trim()),
      hint: "<clientId>",
    },
  },
  directory: {
    self: async () => null,
    listPeers: async ({ cfg, accountId, query, limit }) => {
      const account = resolveOpenclawChatAccount({ cfg: cfg as ClawdbotConfig, accountId });
      const q = query?.trim().toLowerCase() || "";
      const peers = Array.from(
        new Set(
          (account.config.allowFrom ?? [])
            .map((entry) => String(entry).trim())
            .filter((entry) => Boolean(entry) && entry !== "*"),
        ),
      )
        .filter((id) => (q ? id.toLowerCase().includes(q) : true))
        .slice(0, limit && limit > 0 ? limit : undefined)
        .map((id) => ({ kind: "user", id }) as const);
      return peers;
    },
    listGroups: async () => [],
  },
  setup: {
    resolveAccountId: ({ accountId }) => normalizeAccountId(accountId),
    applyAccountName: ({ cfg, accountId, name }) =>
      applyAccountNameToChannelSection({
        cfg: cfg as ClawdbotConfig,
        channelKey: "openclawChat",
        accountId,
        name,
      }),
    validateInput: ({ input }) => {
      if (input.port && Number(input.port) <= 0) {
        return "OpenClaw Chat port must be a positive number.";
      }
      return null;
    },
    applyAccountConfig: ({ cfg, accountId, input }) => {
      const namedConfig = applyAccountNameToChannelSection({
        cfg: cfg as ClawdbotConfig,
        channelKey: "openclawChat",
        accountId,
        name: input.name,
      });
      const next =
        accountId !== DEFAULT_ACCOUNT_ID
          ? migrateBaseNameToDefaultAccount({
              cfg: namedConfig,
              channelKey: "openclawChat",
            })
          : namedConfig;

      const host = input.host ? String(input.host).trim() : undefined;
      const rawPath = input.path ? String(input.path).trim() : undefined;
      const path = rawPath ? (rawPath.startsWith("/") ? rawPath : `/${rawPath}`) : undefined;
      const authToken = input.authToken ? String(input.authToken).trim() : undefined;
      const port = input.port ? Number(input.port) : undefined;

      if (accountId === DEFAULT_ACCOUNT_ID) {
        return {
          ...next,
          channels: {
            ...next.channels,
            openclawChat: {
              ...next.channels?.openclawChat,
              enabled: true,
              ...(host ? { host } : {}),
              ...(path ? { path } : {}),
              ...(authToken ? { authToken } : {}),
              ...(port ? { port } : {}),
            },
          },
        } as ClawdbotConfig;
      }
      const ocCfg = (next.channels?.openclawChat ?? {}) as Record<string, unknown>;
      const accountsCfg = (ocCfg.accounts ?? {}) as Record<string, unknown>;
      const existingAccount = (accountsCfg[accountId] ?? {}) as Record<string, unknown>;
      return {
        ...next,
        channels: {
          ...((next.channels ?? {}) as Record<string, unknown>),
          openclawChat: {
            ...ocCfg,
            enabled: true,
            accounts: {
              ...accountsCfg,
              [accountId]: {
                ...existingAccount,
                enabled: true,
                ...(host ? { host } : {}),
                ...(path ? { path } : {}),
                ...(authToken ? { authToken } : {}),
                ...(port ? { port } : {}),
              },
            },
          },
        },
      } as ClawdbotConfig;
    },
  },
  pairing: {
    idLabel: "clientId",
    normalizeAllowEntry: (entry) => entry.replace(/^(openclawchat|openclaw-chat|occhat|ios):/i, ""),
    notifyApproval: async ({ cfg, id }) => {
      const account = resolveOpenclawChatAccount({ cfg: cfg as ClawdbotConfig });
      await sendSystemMessage(account.accountId, id, PAIRING_APPROVED_MESSAGE);
    },
  },
  outbound: {
    deliveryMode: "direct",
    chunker: (text, limit) => {
      if (!text) return [];
      if (limit <= 0 || text.length <= limit) return [text];
      const chunks: string[] = [];
      let remaining = text;
      while (remaining.length > limit) {
        const window = remaining.slice(0, limit);
        const lastNewline = window.lastIndexOf("\n");
        const lastSpace = window.lastIndexOf(" ");
        let breakIdx = lastNewline > 0 ? lastNewline : lastSpace;
        if (breakIdx <= 0) breakIdx = limit;
        const rawChunk = remaining.slice(0, breakIdx);
        const chunk = rawChunk.trimEnd();
        if (chunk.length > 0) chunks.push(chunk);
        const brokeOnSeparator = breakIdx < remaining.length && /\s/.test(remaining[breakIdx]);
        const nextStart = Math.min(remaining.length, breakIdx + (brokeOnSeparator ? 1 : 0));
        remaining = remaining.slice(nextStart).trimStart();
      }
      if (remaining.length) chunks.push(remaining);
      return chunks;
    },
    chunkerMode: "text",
    textChunkLimit: 4000,
    sendText: async ({ to, text, accountId, cfg }) => {
      const account = resolveOpenclawChatAccount({
        accountId: accountId ?? undefined,
        cfg: cfg as ClawdbotConfig,
      });
      const result = await sendTextMessage(account.accountId, to, text);
      return {
        channel: "openclawChat",
        ok: result.ok,
        messageId: result.messageId ?? "",
        error: result.error ? new Error(result.error) : undefined,
      };
    },
    sendMedia: async ({ to, text, mediaUrl, accountId, cfg }) => {
      const account = resolveOpenclawChatAccount({
        accountId: accountId ?? undefined,
        cfg: cfg as ClawdbotConfig,
      });
      const result = await sendMediaMessage(account.accountId, to, mediaUrl ?? "", text);
      return {
        channel: "openclawChat",
        ok: result.ok,
        messageId: result.messageId ?? "",
        error: result.error ? new Error(result.error) : undefined,
      };
    },
  },
  status: {
    defaultRuntime: {
      accountId: DEFAULT_ACCOUNT_ID,
      running: false,
      lastStartAt: null,
      lastStopAt: null,
      lastError: null,
      clients: 0,
    },
    collectStatusIssues: collectOpenclawChatStatusIssues,
    buildChannelSummary: ({ snapshot }) => ({
      configured: snapshot.configured ?? false,
      tokenSource: snapshot.tokenSource ?? "none",
      running: snapshot.running ?? false,
      mode: "websocket",
      lastStartAt: snapshot.lastStartAt ?? null,
      lastStopAt: snapshot.lastStopAt ?? null,
      lastError: snapshot.lastError ?? null,
      lastInboundAt: snapshot.lastInboundAt ?? null,
      lastOutboundAt: snapshot.lastOutboundAt ?? null,
      clients: snapshot.clients ?? 0,
      host: snapshot.host ?? defaults.host,
      port: snapshot.port ?? defaults.port,
      path: snapshot.path ?? defaults.path,
      probe: snapshot.probe,
      lastProbeAt: snapshot.lastProbeAt ?? null,
    }),
    probeAccount: async ({ account, timeoutMs }) =>
      probeOpenclawChat(account.host, account.port, timeoutMs),
    buildAccountSnapshot: ({ account, runtime }) => {
      const configured = Boolean(account.port);
      return {
        accountId: account.accountId,
        name: account.name,
        enabled: account.enabled,
        configured,
        tokenSource: account.tokenSource,
        running: runtime?.running ?? false,
        lastStartAt: runtime?.lastStartAt ?? null,
        lastStopAt: runtime?.lastStopAt ?? null,
        lastError: runtime?.lastError ?? null,
        mode: "websocket",
        lastInboundAt: runtime?.lastInboundAt ?? null,
        lastOutboundAt: runtime?.lastOutboundAt ?? null,
        dmPolicy: account.config.dmPolicy ?? "pairing",
        host: account.host,
        port: account.port,
        path: account.path,
        authToken: account.authToken ? true : false,
        clients: runtime?.clients ?? 0,
      };
    },
  },
  gateway: {
    startAccount: async (ctx) => {
      const account = ctx.account;
      const label = ` (${account.host}:${account.port}${account.path})`;

      ctx.log?.info(
        `[${account.accountId}] Starting OpenClaw Chat provider${label}`,
      );

      const provider = startOpenclawChatProvider({
        account,
        config: ctx.cfg as ClawdbotConfig,
        log: {
          info: (msg) => ctx.log?.info(msg),
          error: (msg) => ctx.log?.error(msg),
          debug: (msg) => ctx.log?.debug?.(msg),
        },
        abortSignal: ctx.abortSignal,
        statusSink: (patch) =>
          ctx.setStatus({ accountId: ctx.accountId, ...patch }),
      });

      return provider;
    },
  },
};

/**
 * OpenClaw Chat onboarding wizard adapter.
 */

import type { ClawdbotConfig } from "clawdbot/plugin-sdk";
import {
  DEFAULT_ACCOUNT_ID,
  normalizeAccountId,
  addWildcardAllowFrom,
} from "./sdk.js";

import {
  defaults,
  listOpenclawChatAccountIds,
  resolveDefaultOpenclawChatAccountId,
  resolveOpenclawChatAccount,
} from "./accounts.js";

const channel = "openclawChat" as const;

function setDmPolicy(
  cfg: ClawdbotConfig,
  dmPolicy: "pairing" | "allowlist" | "open" | "disabled",
): ClawdbotConfig {
  const ocCfg = cfg.channels?.openclawChat ?? {};
  const existingAllowFrom = Array.isArray(ocCfg.allowFrom) ? ocCfg.allowFrom : [];
  const allowFrom =
    dmPolicy === "open" ? addWildcardAllowFrom(existingAllowFrom) : undefined;
  return {
    ...cfg,
    channels: {
      ...(cfg.channels ?? {}),
      openclawChat: {
        ...ocCfg,
        dmPolicy,
        ...(allowFrom ? { allowFrom } : {}),
      },
    },
  } as ClawdbotConfig;
}

async function noteSetupHelp(prompter: WizardPrompter): Promise<void> {
  await prompter.note(
    [
      "OpenClaw Chat runs a local WebSocket server for your iOS app (or a web client).",
      "",
      "1) Choose a port (default 8787) and optional authToken",
      "2) Start OpenClaw Gateway",
      "3) Connect your client to ws://<host>:<port>/openclaw-chat",
      "",
      "Tip: use test/ws-client.html to simulate the iOS app.",
    ].join("\n"),
    "OpenClaw Chat Setup",
  );
}

/** WizardPrompter interface for onboarding. */
interface WizardPrompter {
  note(message: string, title?: string): Promise<void>;
  text(opts: {
    message: string;
    placeholder?: string;
    initialValue?: string;
    validate?: (value: unknown) => string | undefined;
  }): Promise<string>;
  select<T>(opts: {
    message: string;
    options: Array<{ value: T; label: string }>;
    initialValue?: T;
  }): Promise<T>;
  confirm?(opts: { message: string; initialValue?: boolean }): Promise<boolean>;
}

async function promptAllowFrom(params: {
  cfg: ClawdbotConfig;
  prompter: WizardPrompter;
  accountId: string;
}): Promise<ClawdbotConfig> {
  const { cfg, prompter, accountId } = params;
  const resolved = resolveOpenclawChatAccount({ cfg, accountId });
  const existingAllowFrom = resolved.config.allowFrom ?? [];
  const entry = await prompter.text({
    message: "OpenClaw Chat allowFrom (clientId)",
    placeholder: "ios-user-001",
    initialValue: existingAllowFrom[0] ? String(existingAllowFrom[0]) : undefined,
    validate: (value: unknown) => {
      const raw = String(value ?? "").trim();
      if (!raw) return "Required";
      return undefined;
    },
  });
  const normalized = String(entry).trim();
  const merged = [
    ...existingAllowFrom.map((item: unknown) => String(item).trim()).filter(Boolean),
    normalized,
  ];
  const unique = [...new Set(merged)];

  const ocCfg = (cfg.channels?.openclawChat ?? {}) as Record<string, unknown>;
  const accounts = (ocCfg.accounts ?? {}) as Record<string, unknown>;

  if (accountId === DEFAULT_ACCOUNT_ID) {
    return {
      ...cfg,
      channels: {
        ...((cfg.channels ?? {}) as Record<string, unknown>),
        openclawChat: {
          ...ocCfg,
          enabled: true,
          dmPolicy: "allowlist",
          allowFrom: unique,
        },
      },
    } as ClawdbotConfig;
  }

  const accountCfg = (accounts[accountId] ?? {}) as Record<string, unknown>;
  return {
    ...cfg,
    channels: {
      ...((cfg.channels ?? {}) as Record<string, unknown>),
      openclawChat: {
        ...ocCfg,
        enabled: true,
        accounts: {
          ...accounts,
          [accountId]: {
            ...accountCfg,
            enabled: accountCfg.enabled ?? true,
            dmPolicy: "allowlist",
            allowFrom: unique,
          },
        },
      },
    },
  } as ClawdbotConfig;
}

/** OpenClaw Chat onboarding adapter for the channel. */
export const openclawChatOnboardingAdapter = {
  configuredCheck: (cfg: ClawdbotConfig): boolean => {
    return listOpenclawChatAccountIds(cfg).some((accountId) =>
      Boolean(resolveOpenclawChatAccount({ cfg, accountId }).port),
    );
  },

  setDmPolicy: (cfg: ClawdbotConfig, policy: "pairing" | "allowlist" | "open" | "disabled"): ClawdbotConfig => {
    return setDmPolicy(cfg, policy);
  },

  promptAllowFrom: async (params: {
    cfg: ClawdbotConfig;
    prompter: WizardPrompter;
    accountId: string;
  }): Promise<ClawdbotConfig> => {
    return promptAllowFrom(params);
  },

  noteSetupHelp: async (prompter: WizardPrompter): Promise<void> => {
    return noteSetupHelp(prompter);
  },

  runSetupWizard: async (params: {
    cfg: ClawdbotConfig;
    prompter: WizardPrompter;
    accountOverrides?: Record<string, string | undefined>;
    shouldPromptAccountIds?: boolean;
    forceAllowFrom?: boolean;
  }): Promise<ClawdbotConfig> => {
    const { cfg, prompter, accountOverrides, shouldPromptAccountIds, forceAllowFrom } = params;
    const ocOverride = accountOverrides?.[channel]?.trim();
    const defaultAccountId = resolveDefaultOpenclawChatAccountId(cfg);
    let ocAccountId = ocOverride ? normalizeAccountId(ocOverride) : defaultAccountId;

    if (shouldPromptAccountIds && !ocOverride) {
      const accountIds = listOpenclawChatAccountIds(cfg);
      const options = accountIds.map((id) => ({ value: id, label: id }));
      ocAccountId = await prompter.select({
        message: "Select OpenClaw Chat account",
        options,
        initialValue: ocAccountId,
      });
    }

    let next = cfg;
    const resolvedAccount = resolveOpenclawChatAccount({ cfg: next, accountId: ocAccountId });
    const accountConfigured = Boolean(resolvedAccount.port);

    if (!accountConfigured) {
      await noteSetupHelp(prompter);
    }

    const port = Number(
      await prompter.text({
        message: "OpenClaw Chat port",
        placeholder: String(defaults.port),
        initialValue: String(resolvedAccount.port || defaults.port),
        validate: (value: unknown) => {
          const num = Number(value);
          if (!Number.isFinite(num) || num <= 0) return "Enter a valid port";
          return undefined;
        },
      }),
    );

    const host = String(
      await prompter.text({
        message: "OpenClaw Chat host",
        placeholder: defaults.host,
        initialValue: resolvedAccount.host || defaults.host,
      }),
    ).trim();

    let path = String(
      await prompter.text({
        message: "WebSocket path",
        placeholder: defaults.path,
        initialValue: resolvedAccount.path || defaults.path,
      }),
    ).trim();
    if (path && !path.startsWith("/")) path = `/${path}`;

    const authToken = String(
      await prompter.text({
        message: "Auth token (optional but recommended)",
        placeholder: "",
        initialValue: resolvedAccount.authToken || "",
      }),
    ).trim();

    const ocCfg2 = (next.channels?.openclawChat ?? {}) as Record<string, unknown>;
    const accounts2 = (ocCfg2.accounts ?? {}) as Record<string, unknown>;

    if (ocAccountId === DEFAULT_ACCOUNT_ID) {
      next = {
        ...next,
        channels: {
          ...((next.channels ?? {}) as Record<string, unknown>),
          openclawChat: {
            ...ocCfg2,
            enabled: true,
            host,
            port,
            path,
            ...(authToken ? { authToken } : {}),
          },
        },
      } as ClawdbotConfig;
    } else {
      const accountCfg2 = (accounts2[ocAccountId] ?? {}) as Record<string, unknown>;
      next = {
        ...next,
        channels: {
          ...((next.channels ?? {}) as Record<string, unknown>),
          openclawChat: {
            ...ocCfg2,
            enabled: true,
            accounts: {
              ...accounts2,
              [ocAccountId]: {
                ...accountCfg2,
                enabled: true,
                host,
                port,
                path,
                ...(authToken ? { authToken } : {}),
              },
            },
          },
        },
      } as ClawdbotConfig;
    }

    if (forceAllowFrom) {
      next = await promptAllowFrom({
        cfg: next,
        prompter,
        accountId: ocAccountId,
      });
    }

    return next;
  },
};

/**
 * SDK exports for OpenClaw environment.
 * 
 * Uses STATIC import so OpenClaw's jiti loader can resolve the alias correctly.
 * DO NOT use dynamic require() here - it bypasses jiti alias resolution.
 */

// Runtime exports
export {
  emptyPluginConfigSchema,
  normalizeAccountId,
  applyAccountNameToChannelSection,
  deleteAccountFromConfigSection,
  setAccountEnabledInConfigSection,
  migrateBaseNameToDefaultAccount,
  formatPairingApproveHint,
  PAIRING_APPROVED_MESSAGE,
  addWildcardAllowFrom,
  DEFAULT_ACCOUNT_ID,
} from "openclaw/plugin-sdk";

// Type exports
export type {
  ClawdbotPluginApi,
  PluginRuntime,
  ClawdbotConfig,
  ChannelPlugin,
  ChannelDock,
  ChannelAccountSnapshot,
  ChannelStatusIssue,
  ChannelOnboardingAdapter,
  WizardPrompter,
} from "openclaw/plugin-sdk";

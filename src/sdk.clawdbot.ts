/**
 * SDK exports for Clawdbot environment.
 * 
 * Uses STATIC import from clawdbot/plugin-sdk.
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
} from "clawdbot/plugin-sdk";

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
} from "clawdbot/plugin-sdk";

/**
 * OpenClaw Chat channel plugin for Clawdbot/OpenClaw.
 *
 * WebSocket bridge for an iOS app (or web client) to chat with OpenClaw/Clawdbot.
 */

import type { ClawdbotPluginApi } from "clawdbot/plugin-sdk";

import { emptyPluginConfigSchema } from "./src/sdk.js";

import { openclawChatDock, openclawChatPlugin } from "./src/channel.js";
import { setOpenclawChatRuntime } from "./src/runtime.js";

const plugin = {
  id: "openclaw-chat",
  name: "OpenClaw Chat",
  description: "OpenClaw Chat channel plugin — WebSocket bridge for iOS app/web client",

  // This plugin registers a channel whose config lives under channels.openclawChat.*.
  // Plugin-level config (plugins.entries.*.config) is intentionally empty.
  configSchema: emptyPluginConfigSchema(),

  register(api: ClawdbotPluginApi) {
    setOpenclawChatRuntime(api.runtime);
    api.registerChannel({ plugin: openclawChatPlugin, dock: openclawChatDock });
  },
};

export default plugin;

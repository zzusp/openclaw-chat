/**
 * Global runtime reference for the OpenClaw Chat plugin.
 */

import type { PluginRuntime } from "clawdbot/plugin-sdk";

let runtime: PluginRuntime | null = null;

export function setOpenclawChatRuntime(next: PluginRuntime): void {
  runtime = next;
}

export function getOpenclawChatRuntime(): PluginRuntime {
  if (!runtime) {
    throw new Error("OpenClaw Chat runtime not initialized");
  }
  return runtime;
}

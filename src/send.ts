/**
 * Send messages to OpenClaw Chat clients via WebSocket.
 */

import { broadcastToAccount, sendToClient } from "./connections.js";
import type { OpenclawChatSendResult } from "./types.js";

function createMessageId(): string {
  return `msg-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

export async function sendTextMessage(
  accountId: string,
  clientId: string,
  text: string,
): Promise<OpenclawChatSendResult> {
  if (!clientId?.trim()) {
    return { ok: false, error: "No clientId provided" };
  }
  const payload = {
    type: "message",
    from: "openclaw",
    to: clientId,
    text,
    ts: Date.now(),
  };

  if (clientId === "*" || clientId === "all") {
    const result = broadcastToAccount(accountId, payload);
    return { ok: result.ok, messageId: createMessageId() };
  }

  const result = sendToClient(accountId, clientId, payload);
  return { ok: result.ok, error: result.error, messageId: createMessageId() };
}

export async function sendMediaMessage(
  accountId: string,
  clientId: string,
  mediaUrl: string,
  text?: string,
): Promise<OpenclawChatSendResult> {
  if (!clientId?.trim()) {
    return { ok: false, error: "No clientId provided" };
  }
  if (!mediaUrl?.trim()) {
    return { ok: false, error: "No media URL provided" };
  }

  const payload = {
    type: "message",
    from: "openclaw",
    to: clientId,
    text,
    mediaUrl,
    ts: Date.now(),
  };

  if (clientId === "*" || clientId === "all") {
    const result = broadcastToAccount(accountId, payload);
    return { ok: result.ok, messageId: createMessageId() };
  }

  const result = sendToClient(accountId, clientId, payload);
  return { ok: result.ok, error: result.error, messageId: createMessageId() };
}

export async function sendSystemMessage(
  accountId: string,
  clientId: string,
  text: string,
): Promise<OpenclawChatSendResult> {
  const payload = {
    type: "system",
    from: "openclaw",
    to: clientId,
    text,
    ts: Date.now(),
  };
  const result = sendToClient(accountId, clientId, payload);
  return { ok: result.ok, error: result.error, messageId: createMessageId() };
}

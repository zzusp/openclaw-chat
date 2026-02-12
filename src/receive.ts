/**
 * OpenClaw Chat WebSocket message receive handler.
 *
 * Starts a local WebSocket server for the iOS app (or web client) to connect.
 */

import { randomUUID } from "node:crypto";
import { WebSocketServer } from "ws";
import type { ClawdbotConfig } from "clawdbot/plugin-sdk";

import type { ResolvedOpenclawChatAccount } from "./types.js";
import { getOpenclawChatRuntime } from "./runtime.js";
import {
  attachConnection,
  closeClient,
  registerClient,
  sendRawToClient,
  setClientId,
} from "./connections.js";
import {
  appendConversationMessage,
  createConversation,
  getConversationHistory,
  listConversations,
} from "./conversation-store.js";

/** Options for the OpenClaw Chat provider. */
export type OpenclawChatProviderOptions = {
  account: ResolvedOpenclawChatAccount;
  config: ClawdbotConfig;
  log: {
    info: (msg: string) => void;
    error: (msg: string) => void;
    debug?: (msg: string) => void;
  };
  abortSignal?: AbortSignal;
  statusSink?: (patch: Record<string, unknown>) => void;
};

type InboundMessage = {
  type?: string;
  text?: string;
  clientId?: string;
  chatType?: "direct" | "group";
  conversationId?: string;
  title?: string;
  participants?: string[];
  limit?: number;
  mediaUrl?: string;
  meta?: Record<string, unknown>;
  token?: string;
};

const AUTH_CLOSE_CODE = 4001;
const DUPLICATE_CLOSE_CODE = 4002;

/** Start the OpenClaw Chat WebSocket provider. Returns a stop function. */
export function startOpenclawChatProvider(
  options: OpenclawChatProviderOptions,
): { stop: () => void } {
  const { account, config, log, statusSink } = options;
  const { host, port, path, authToken } = account;

  log.info(
    `[openclawChat:${account.accountId}] Starting WebSocket server on ws://${host}:${port}${path}`,
  );

  const wss = new WebSocketServer({ host, port, path });

  wss.on("connection", (ws, req) => {
    const { token, clientId } = parseQuery(req.url ?? "");
    const authHeader = req.headers["authorization"];
    const headerToken =
      typeof authHeader === "string" && authHeader.startsWith("Bearer ")
        ? authHeader.slice("Bearer ".length)
        : "";

    const providedToken = (token || headerToken || "").trim();
    if (authToken && providedToken !== authToken) {
      ws.close(AUTH_CLOSE_CODE, "unauthorized");
      return;
    }

    const assignedClientId = sanitizeClientId(clientId) || createClientId();
    const registerResult = registerClient(account.accountId, assignedClientId, ws, {
      remoteAddress: req.socket.remoteAddress,
      userAgent: req.headers["user-agent"],
    });
    if (!registerResult.ok) {
      ws.close(DUPLICATE_CLOSE_CODE, registerResult.reason);
      return;
    }

    attachConnection(ws, {
      accountId: account.accountId,
      clientId: assignedClientId,
    });

    statusSink?.({ clients: registerResult.clientCount });

    ws.on("message", async (data) => {
      const text = coerceMessageText(data);
      if (!text) return;

      let payload: InboundMessage = {};
      if (text.trim().startsWith("{")) {
        try {
          payload = JSON.parse(text) as InboundMessage;
        } catch {
          payload = { type: "message", text };
        }
      } else {
        payload = { type: "message", text };
      }

      if (payload.type === "hello") {
        const nextClientId = sanitizeClientId(payload.clientId);
        const nextToken = payload.token?.trim();
        if (authToken && nextToken && nextToken !== authToken) {
          ws.close(AUTH_CLOSE_CODE, "unauthorized");
          return;
        }
        if (nextClientId && nextClientId !== assignedClientId) {
          const result = setClientId(account.accountId, assignedClientId, nextClientId, ws);
          if (!result.ok) {
            ws.close(DUPLICATE_CLOSE_CODE, result.reason);
            return;
          }
        }
        sendRawToClient(ws, {
          type: "hello",
          ok: true,
          clientId: nextClientId ?? assignedClientId,
        });
        return;
      }

      if (payload.type === "ping") {
        sendRawToClient(ws, { type: "pong", ts: Date.now() });
        return;
      }

      if (
        payload.type === "new_conversation" ||
        payload.type === "newConversation" ||
        payload.type === "create_conversation"
      ) {
        const conversationId = sanitizeConversationId(payload.conversationId) || createConversationId();
        const title = payload.title?.trim() || undefined;
        const participants = payload.participants?.filter((entry) => Boolean(entry));
        const record = await createConversation({
          account,
          conversationId,
          title,
          participants,
          log,
        });

        sendRawToClient(ws, {
          type: "conversation_created",
          ok: Boolean(record),
          conversation: record
            ? {
                id: record.id,
                createdAt: record.createdAt,
                updatedAt: record.updatedAt,
                title: record.title,
                participants: record.participants,
                messageCount: record.messages.length,
              }
            : null,
        });
        return;
      }

      if (payload.type === "list_conversations") {
        const conversations = await listConversations({
          account,
          log,
          limit: payload.limit,
        });
        sendRawToClient(ws, {
          type: "list_conversations",
          ok: true,
          conversations,
        });
        return;
      }

      if (payload.type === "get_history") {
        const conversationId = sanitizeConversationId(payload.conversationId);
        if (!conversationId) {
          sendRawToClient(ws, {
            type: "history",
            ok: false,
            error: "conversationId required",
          });
          return;
        }
        const history = await getConversationHistory({
          account,
          conversationId,
          log,
          limit: payload.limit,
        });
        sendRawToClient(ws, {
          type: "history",
          ok: true,
          conversationId,
          conversation: history.conversation
            ? {
                id: history.conversation.id,
                createdAt: history.conversation.createdAt,
                updatedAt: history.conversation.updatedAt,
                title: history.conversation.title,
                participants: history.conversation.participants,
                messageCount: history.conversation.messages.length,
              }
            : null,
          messages: history.messages,
        });
        return;
      }

      if (payload.type !== "message" && payload.type !== undefined) {
        return;
      }

      const senderId = sanitizeClientId(payload.clientId) || assignedClientId;
      const chatType = payload.chatType === "group" ? "group" : "direct";
      const conversationId = payload.conversationId || senderId;
      const messageText = (payload.text ?? "").trim();
      const mediaUrl = payload.mediaUrl;

      if (!messageText && !mediaUrl) return;

      statusSink?.({ lastInboundAt: Date.now() });

      const sessionKey = `openclawChat:${conversationId}`;

      log.info(
        `[openclawChat:${account.accountId}] Received from ${senderId}: ${messageText.slice(0, 80)}`,
      );

      const runtime = getOpenclawChatRuntime();
      const channel = (runtime as Record<string, unknown>).channel as
        | { reply?: { dispatchReplyWithBufferedBlockDispatcher?: (opts: unknown) => Promise<unknown> } }
        | undefined;

      if (!channel?.reply?.dispatchReplyWithBufferedBlockDispatcher) {
        log.error(`[openclawChat:${account.accountId}] dispatchReplyWithBufferedBlockDispatcher not available`);
        return;
      }

      const inboundCtx = {
        Body: messageText || mediaUrl || "",
        RawBody: messageText || mediaUrl || "",
        CommandBody: messageText || "",
        From: senderId,
        To: conversationId,
        SessionKey: sessionKey,
        AccountId: account.accountId,
        MessageSid: createMessageId(),
        ChatType: chatType,
        ConversationLabel: conversationId,
        SenderId: senderId,
        CommandAuthorized: true,
        Provider: "openclawChat",
        Surface: "openclawChat",
        OriginatingChannel: "openclawChat",
        OriginatingTo: conversationId,
        DeliveryContext: {
          channel: "openclawChat",
          to: senderId,
          accountId: account.accountId,
          mediaUrl,
        },
      };

      try {
        try {
          await appendConversationMessage({
            account,
            conversationId,
            log,
            message: {
              direction: "inbound",
              ts: Date.now(),
              from: senderId,
              to: conversationId,
              text: messageText,
              mediaUrl,
              chatType,
              meta: payload.meta,
            },
          });
        } catch (err) {
          log.error(
            `[openclawChat:${account.accountId}] History write failed: ${err instanceof Error ? err.message : String(err)}`,
          );
        }

        await channel.reply.dispatchReplyWithBufferedBlockDispatcher({
          ctx: inboundCtx,
          cfg: (runtime as { config?: { loadConfig?: () => ClawdbotConfig } }).config?.loadConfig?.() ?? config,
          replyResolver: null,
          dispatcherOptions: {
            deliver: async (payload: unknown) => {
              const p =
                typeof payload === "string"
                  ? { text: payload }
                  : (payload as { text?: string; body?: string; mediaUrl?: string; mediaUrls?: string[] });
              const replyText = typeof payload === "string" ? payload : (p.text ?? p.body ?? "");
              const replyMediaUrl =
                typeof payload === "string" ? undefined : p.mediaUrl ?? p.mediaUrls?.[0];

              const trimmed = (replyText || "").trim();
              if ((!trimmed || trimmed === "NO_REPLY" || trimmed.endsWith("NO_REPLY")) && !replyMediaUrl) {
                return;
              }

              statusSink?.({ lastOutboundAt: Date.now() });

              const response = {
                type: "message",
                from: "openclaw",
                to: senderId,
                text: replyText,
                mediaUrl: replyMediaUrl,
                ts: Date.now(),
              };

              try {
                await appendConversationMessage({
                  account,
                  conversationId,
                  log,
                  message: {
                    direction: "outbound",
                    ts: response.ts,
                    from: "openclaw",
                    to: senderId,
                    text: replyText,
                    mediaUrl: replyMediaUrl,
                    chatType,
                  },
                });
              } catch (err) {
                log.error(
                  `[openclawChat:${account.accountId}] History write failed: ${err instanceof Error ? err.message : String(err)}`,
                );
              }

              sendRawToClient(ws, response);
            },
            onError: (err: Error) => {
              log.error(`[openclawChat:${account.accountId}] Dispatcher error: ${err.message}`);
            },
          },
        });
      } catch (err) {
        log.error(
          `[openclawChat:${account.accountId}] Dispatch error: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    });

    ws.on("close", () => {
      const result = closeClient(account.accountId, ws);
      statusSink?.({ clients: result.clientCount });
    });
  });

  wss.on("listening", () => {
    log.info(`[openclawChat:${account.accountId}] WebSocket server ready`);
    statusSink?.({ running: true, lastStartAt: Date.now() });
  });

  wss.on("error", (err) => {
    log.error(`[openclawChat:${account.accountId}] WebSocket error: ${err.message}`);
    statusSink?.({ lastError: err.message });
  });

  options.abortSignal?.addEventListener("abort", () => {
    stop();
  });

  const stop = () => {
    log.info(`[openclawChat:${account.accountId}] Stopping WebSocket server`);
    wss.close();
    statusSink?.({ running: false, lastStopAt: Date.now() });
  };

  return { stop };
}

function parseQuery(url: string): { token?: string; clientId?: string } {
  const queryIdx = url.indexOf("?");
  if (queryIdx === -1) return {};
  const query = new URLSearchParams(url.slice(queryIdx + 1));
  const token = query.get("token") ?? undefined;
  const clientId = query.get("clientId") ?? query.get("client_id") ?? undefined;
  return { token: token || undefined, clientId: clientId || undefined };
}

function sanitizeClientId(input?: string): string | undefined {
  if (!input) return undefined;
  const trimmed = input.trim();
  if (!trimmed) return undefined;
  return trimmed;
}

function sanitizeConversationId(input?: string): string | undefined {
  if (!input) return undefined;
  const trimmed = input.trim();
  if (!trimmed) return undefined;
  return trimmed;
}

function createClientId(): string {
  return `client-${randomUUID()}`;
}

function createMessageId(): string {
  return `msg-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function createConversationId(): string {
  return `conv-${randomUUID()}`;
}

function coerceMessageText(data: unknown): string {
  if (typeof data === "string") return data;
  if (data instanceof Buffer) return data.toString("utf8");
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString("utf8");
  if (ArrayBuffer.isView(data)) return Buffer.from(data.buffer).toString("utf8");
  return "";
}

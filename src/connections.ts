/**
 * Connection registry for OpenClaw Chat WebSocket clients.
 */

import WebSocket from "ws";

type ClientMeta = {
  remoteAddress?: string;
  userAgent?: string;
};

type ClientRecord = {
  accountId: string;
  clientId: string;
  ws: WebSocket;
  connectedAt: number;
  lastSeenAt: number;
  meta?: ClientMeta;
};

const connectionIndex = new WeakMap<WebSocket, ClientRecord>();
const clientsByAccount = new Map<string, Map<string, ClientRecord>>();

function getAccountMap(accountId: string): Map<string, ClientRecord> {
  let map = clientsByAccount.get(accountId);
  if (!map) {
    map = new Map();
    clientsByAccount.set(accountId, map);
  }
  return map;
}

export function attachConnection(ws: WebSocket, record: { accountId: string; clientId: string }): void {
  const existing = connectionIndex.get(ws);
  if (!existing) {
    connectionIndex.set(ws, {
      accountId: record.accountId,
      clientId: record.clientId,
      ws,
      connectedAt: Date.now(),
      lastSeenAt: Date.now(),
    });
  } else {
    existing.clientId = record.clientId;
    existing.accountId = record.accountId;
    existing.lastSeenAt = Date.now();
  }
}

export function registerClient(
  accountId: string,
  clientId: string,
  ws: WebSocket,
  meta?: ClientMeta,
): { ok: boolean; reason?: string; clientCount: number } {
  const map = getAccountMap(accountId);
  const existing = map.get(clientId);
  if (existing && existing.ws !== ws) {
    try {
      existing.ws.close(4000, "duplicate connection");
    } catch {
      // ignore
    }
  }

  const record: ClientRecord = {
    accountId,
    clientId,
    ws,
    connectedAt: Date.now(),
    lastSeenAt: Date.now(),
    meta,
  };
  map.set(clientId, record);
  connectionIndex.set(ws, record);

  return { ok: true, clientCount: map.size };
}

export function setClientId(
  accountId: string,
  oldId: string,
  nextId: string,
  ws: WebSocket,
): { ok: boolean; reason?: string; clientCount: number } {
  const map = getAccountMap(accountId);
  if (map.has(nextId)) {
    return { ok: false, reason: "clientId already in use", clientCount: map.size };
  }
  const record = map.get(oldId);
  if (!record || record.ws !== ws) {
    return { ok: false, reason: "connection not registered", clientCount: map.size };
  }
  map.delete(oldId);
  record.clientId = nextId;
  record.lastSeenAt = Date.now();
  map.set(nextId, record);
  connectionIndex.set(ws, record);
  return { ok: true, clientCount: map.size };
}

export function closeClient(
  accountId: string,
  ws: WebSocket,
): { ok: boolean; clientCount: number } {
  const map = getAccountMap(accountId);
  const record = connectionIndex.get(ws);
  if (record) {
    map.delete(record.clientId);
    connectionIndex.delete(ws);
  }
  return { ok: true, clientCount: map.size };
}

export function sendRawToClient(ws: WebSocket, payload: Record<string, unknown>): void {
  try {
    if (ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify(payload));
  } catch {
    // ignore
  }
}

export function sendToClient(
  accountId: string,
  clientId: string,
  payload: Record<string, unknown>,
): { ok: boolean; error?: string } {
  const map = getAccountMap(accountId);
  const record = map.get(clientId);
  if (!record) return { ok: false, error: "client not connected" };
  try {
    if (record.ws.readyState !== WebSocket.OPEN) {
      return { ok: false, error: "client not connected" };
    }
    record.ws.send(JSON.stringify(payload));
    record.lastSeenAt = Date.now();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export function broadcastToAccount(
  accountId: string,
  payload: Record<string, unknown>,
): { ok: boolean; delivered: number } {
  const map = getAccountMap(accountId);
  let delivered = 0;
  for (const record of map.values()) {
    try {
      if (record.ws.readyState !== WebSocket.OPEN) continue;
      record.ws.send(JSON.stringify(payload));
      record.lastSeenAt = Date.now();
      delivered += 1;
    } catch {
      // ignore
    }
  }
  return { ok: true, delivered };
}

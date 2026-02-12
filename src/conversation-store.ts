import path from "node:path";
import { promises as fs } from "node:fs";
import { randomUUID, createHash } from "node:crypto";
import type { ResolvedOpenclawChatAccount } from "./types.js";

export type ConversationMessage = {
  id: string;
  ts: number;
  direction: "inbound" | "outbound" | "system";
  from?: string;
  to?: string;
  text?: string;
  mediaUrl?: string;
  chatType?: "direct" | "group";
  meta?: Record<string, unknown>;
};

export type ConversationRecord = {
  id: string;
  createdAt: number;
  updatedAt: number;
  title?: string;
  participants?: string[];
  messages: ConversationMessage[];
};

type ConversationSummary = {
  id: string;
  createdAt: number;
  updatedAt: number;
  title?: string;
  participants?: string[];
  messageCount: number;
  lastMessage?: ConversationMessage;
};

type ConversationIndexFile = {
  version: 1;
  conversations: Record<string, ConversationSummary>;
};

type ConversationFile = {
  version: 1;
  conversation: Omit<ConversationRecord, "messages">;
  messages: ConversationMessage[];
};

type HistorySettings = {
  enabled: boolean;
  dirPath: string;
  maxMessages: number;
};

type LogFn = { info?: (msg: string) => void; error?: (msg: string) => void; debug?: (msg: string) => void };

const DEFAULT_MAX_MESSAGES = 5000;
const DEFAULT_DIR = "/home/node/.openclaw/openclaw-chat";
const INDEX_FILE = "_index.json";

const storeLocks = new Map<string, Promise<unknown>>();

export function resolveHistorySettings(account: ResolvedOpenclawChatAccount): HistorySettings {
  const enabled = account.config.historyEnabled !== false;
  const dirPath = resolveHistoryDir(account);
  const maxMessagesRaw = account.config.historyMaxMessages;
  const maxMessages = Number.isFinite(maxMessagesRaw)
    ? Math.max(0, Number(maxMessagesRaw))
    : DEFAULT_MAX_MESSAGES;

  return { enabled, dirPath, maxMessages };
}

function resolveHistoryDir(account: ResolvedOpenclawChatAccount): string {
  const configured = account.config.historyPath?.trim();
  if (!configured) return DEFAULT_DIR;

  const normalized = configured.replace(/\\/g, path.sep);
  if (normalized.endsWith(".json")) {
    return path.dirname(normalized);
  }

  if (path.isAbsolute(normalized)) return normalized;
  return path.join(process.cwd(), normalized);
}

function sanitizeFilePart(input: string): string {
  return input.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function safeConversationFileName(id: string): string {
  const sanitized = sanitizeFilePart(id);
  if (sanitized === id) return `${sanitized}.json`;
  const hash = createHash("sha1").update(id).digest("hex").slice(0, 8);
  return `${sanitized}-${hash}.json`;
}

async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

function withStoreLock<T>(dirPath: string, fn: () => Promise<T>): Promise<T> {
  const prev = storeLocks.get(dirPath) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  storeLocks.set(
    dirPath,
    next.finally(() => {
      if (storeLocks.get(dirPath) === next) {
        storeLocks.delete(dirPath);
      }
    }),
  );
  return next;
}

function indexPath(dirPath: string): string {
  return path.join(dirPath, INDEX_FILE);
}

function conversationPath(dirPath: string, id: string): string {
  return path.join(dirPath, safeConversationFileName(id));
}

async function readIndexFile(dirPath: string, log?: LogFn): Promise<ConversationIndexFile> {
  try {
    const raw = await fs.readFile(indexPath(dirPath), "utf8");
    const parsed = JSON.parse(raw) as ConversationIndexFile;
    if (!parsed || parsed.version !== 1 || typeof parsed.conversations !== "object") {
      throw new Error("invalid index format");
    }
    return parsed;
  } catch (err) {
    const isMissing = err instanceof Error && (err as NodeJS.ErrnoException).code === "ENOENT";
    if (!isMissing) {
      log?.error?.(`[openclawChat] Failed to read history index: ${err instanceof Error ? err.message : String(err)}`);
      await backupCorruptFile(indexPath(dirPath), log);
    }
    return { version: 1, conversations: {} };
  }
}

async function writeIndexFile(dirPath: string, index: ConversationIndexFile): Promise<void> {
  await ensureDir(dirPath);
  const json = JSON.stringify(index, null, 2);
  await fs.writeFile(indexPath(dirPath), json, "utf8");
}

async function readConversationFile(dirPath: string, id: string, log?: LogFn): Promise<ConversationFile | null> {
  const filePath = conversationPath(dirPath, id);
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as ConversationFile;
    if (!parsed || parsed.version !== 1 || typeof parsed.conversation !== "object") {
      throw new Error("invalid conversation format");
    }
    return parsed;
  } catch (err) {
    const isMissing = err instanceof Error && (err as NodeJS.ErrnoException).code === "ENOENT";
    if (!isMissing) {
      log?.error?.(`[openclawChat] Failed to read conversation file: ${err instanceof Error ? err.message : String(err)}`);
      await backupCorruptFile(filePath, log);
    }
    return null;
  }
}

async function writeConversationFile(dirPath: string, file: ConversationFile): Promise<void> {
  await ensureDir(dirPath);
  const json = JSON.stringify(file, null, 2);
  await fs.writeFile(conversationPath(dirPath, file.conversation.id), json, "utf8");
}

async function backupCorruptFile(filePath: string, log?: LogFn): Promise<void> {
  try {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = `${filePath}.corrupt-${stamp}`;
    await fs.rename(filePath, backupPath);
    log?.error?.(`[openclawChat] Backed up corrupt history file to ${backupPath}`);
  } catch {
    // ignore
  }
}

function createConversationRecord(params: {
  id?: string;
  title?: string;
  participants?: string[];
  createdAt?: number;
}): ConversationRecord {
  const now = params.createdAt ?? Date.now();
  const id = params.id ?? `conv-${randomUUID()}`;
  return {
    id,
    createdAt: now,
    updatedAt: now,
    title: params.title?.trim() || undefined,
    participants: params.participants?.filter(Boolean),
    messages: [],
  };
}

function toConversationSummary(record: ConversationRecord): ConversationSummary {
  const lastMessage = record.messages[record.messages.length - 1];
  return {
    id: record.id,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    title: record.title,
    participants: record.participants,
    messageCount: record.messages.length,
    lastMessage,
  };
}

export async function createConversation(opts: {
  account: ResolvedOpenclawChatAccount;
  conversationId?: string;
  title?: string;
  participants?: string[];
  log?: LogFn;
}): Promise<ConversationRecord | null> {
  const settings = resolveHistorySettings(opts.account);
  if (!settings.enabled) return null;

  return withStoreLock(settings.dirPath, async () => {
    const index = await readIndexFile(settings.dirPath, opts.log);
    const id = opts.conversationId?.trim() || undefined;
    const existing = id ? index.conversations[id] : undefined;
    if (existing) {
      const file = await readConversationFile(settings.dirPath, existing.id, opts.log);
      if (file) {
        return { ...file.conversation, messages: file.messages };
      }
    }

    const record = createConversationRecord({
      id,
      title: opts.title,
      participants: opts.participants,
    });

    const file: ConversationFile = {
      version: 1,
      conversation: {
        id: record.id,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        title: record.title,
        participants: record.participants,
      },
      messages: [],
    };

    await writeConversationFile(settings.dirPath, file);
    index.conversations[record.id] = toConversationSummary(record);
    await writeIndexFile(settings.dirPath, index);
    return record;
  });
}

export async function appendConversationMessage(opts: {
  account: ResolvedOpenclawChatAccount;
  conversationId: string;
  message: Omit<ConversationMessage, "id"> & { id?: string };
  log?: LogFn;
}): Promise<ConversationMessage | null> {
  const settings = resolveHistorySettings(opts.account);
  if (!settings.enabled) return null;

  return withStoreLock(settings.dirPath, async () => {
    const id = opts.conversationId.trim();
    if (!id) return null;

    const index = await readIndexFile(settings.dirPath, opts.log);
    let file = await readConversationFile(settings.dirPath, id, opts.log);

    if (!file) {
      const record = createConversationRecord({ id });
      file = {
        version: 1,
        conversation: {
          id: record.id,
          createdAt: record.createdAt,
          updatedAt: record.updatedAt,
          title: record.title,
          participants: record.participants,
        },
        messages: [],
      };
    }

    const msg: ConversationMessage = {
      id: opts.message.id ?? `msg-${randomUUID()}`,
      ts: opts.message.ts ?? Date.now(),
      direction: opts.message.direction,
      from: opts.message.from,
      to: opts.message.to,
      text: opts.message.text,
      mediaUrl: opts.message.mediaUrl,
      chatType: opts.message.chatType,
      meta: opts.message.meta,
    };

    file.messages.push(msg);
    if (settings.maxMessages > 0 && file.messages.length > settings.maxMessages) {
      file.messages.splice(0, file.messages.length - settings.maxMessages);
    }
    file.conversation.updatedAt = msg.ts;

    await writeConversationFile(settings.dirPath, file);

    index.conversations[file.conversation.id] = {
      id: file.conversation.id,
      createdAt: file.conversation.createdAt,
      updatedAt: file.conversation.updatedAt,
      title: file.conversation.title,
      participants: file.conversation.participants,
      messageCount: file.messages.length,
      lastMessage: file.messages[file.messages.length - 1],
    };
    await writeIndexFile(settings.dirPath, index);

    return msg;
  });
}

export async function listConversations(opts: {
  account: ResolvedOpenclawChatAccount;
  log?: LogFn;
  limit?: number;
}): Promise<Array<ConversationSummary>> {
  const settings = resolveHistorySettings(opts.account);
  if (!settings.enabled) return [];

  return withStoreLock(settings.dirPath, async () => {
    const index = await readIndexFile(settings.dirPath, opts.log);
    const list = Object.values(index.conversations)
      .sort((a, b) => b.updatedAt - a.updatedAt);
    if (opts.limit && opts.limit > 0) return list.slice(0, opts.limit);
    return list;
  });
}

export async function getConversationHistory(opts: {
  account: ResolvedOpenclawChatAccount;
  conversationId: string;
  log?: LogFn;
  limit?: number;
}): Promise<{ conversation?: ConversationRecord; messages: ConversationMessage[] }> {
  const settings = resolveHistorySettings(opts.account);
  if (!settings.enabled) return { messages: [] };

  return withStoreLock(settings.dirPath, async () => {
    const convo = await readConversationFile(settings.dirPath, opts.conversationId.trim(), opts.log);
    if (!convo) return { messages: [] };
    const messages = opts.limit && opts.limit > 0
      ? convo.messages.slice(-opts.limit)
      : convo.messages.slice();
    return { conversation: { ...convo.conversation, messages: convo.messages }, messages };
  });
}

export function resolveConversationId(raw?: string | null): string | undefined {
  const trimmed = raw?.trim();
  if (!trimmed) return undefined;
  return trimmed;
}

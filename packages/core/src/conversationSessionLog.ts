import { mkdir, appendFile, access } from "node:fs/promises";
import { join } from "node:path";
import { dirname } from "node:path";

export type ConversationSessionLogKind = "cv" | "bts";

export interface ConversationSessionLogEntryBase {
  companyId: string;
  conversationId: string;
  timestamp: number;
}

export interface CustomerViewConversationSessionLogEntry extends ConversationSessionLogEntryBase {
  kind: "cv";
  actor: "customer" | "assistant" | "owner";
  text: string;
}

export interface BackgroundTraceConversationSessionLogEntry extends ConversationSessionLogEntryBase {
  kind: "bts";
  details: string;
  event: string;
}

export type ConversationSessionLogEntry =
  | CustomerViewConversationSessionLogEntry
  | BackgroundTraceConversationSessionLogEntry;

export interface ConversationSessionLogWriter {
  append(entry: ConversationSessionLogEntry): Promise<void>;
}

export interface CreateConversationSessionLogOptions {
  filePath: string;
  sessionId: string;
  startedAt?: Date;
}

export const createConversationSessionLogSessionId = (now = () => new Date()): string => {
  const iso = now().toISOString().replace(/[-:]/g, "").replace(/\./g, "").replace("T", "T");
  return `${iso}-${crypto.randomUUID()}`;
};

export const createConversationSessionLogSessionPath = (input: {
  logDirectory: string;
  sessionId: string;
}): string => join(input.logDirectory, `${input.sessionId}.md`);

const toMarkdownHeader = (sessionId: string, startedAt: Date): string => [
  "# Conversation Session Log",
  "",
  `- Session ID: \`${sessionId}\``,
  `- Started At: \`${startedAt.toISOString()}\``,
  "",
].join("\n");

const formatEntryLine = (entry: ConversationSessionLogEntry): string => {
  const timestamp = new Date(entry.timestamp).toISOString();

  if (entry.kind === "cv") {
    return `- [CV] ${timestamp} company=${entry.companyId} conversation=${entry.conversationId} actor=${entry.actor}\n\n${entry.text}\n`;
  }

  return `- [BTS] ${timestamp} company=${entry.companyId} conversation=${entry.conversationId} event=${entry.event}\n\n${entry.details}\n`;
};

export const createConversationSessionLog = (
  options: CreateConversationSessionLogOptions,
): ConversationSessionLogWriter => {
  let initialized = false;
  let writeQueue: Promise<void>;
  const startedAt = options.startedAt ?? new Date();

  const ensureHeader = async () => {
    if (initialized) {
      return;
    }

    await mkdir(dirname(options.filePath), { recursive: true });

    try {
      await access(options.filePath);
    } catch {
      await appendFile(options.filePath, toMarkdownHeader(options.sessionId, startedAt));
    }

    initialized = true;
  };

  writeQueue = ensureHeader().catch(() => undefined);

  return {
    append(entry) {
      writeQueue = writeQueue.then(async () => {
        await ensureHeader();
        await appendFile(options.filePath, `${formatEntryLine(entry)}\n`);
      });

      return writeQueue;
    },
  };
};

import { mkdir, appendFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

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

const assertValidDate = (value: Date): void => {
  if (Number.isNaN(value.getTime())) {
    throw new Error("Conversation session log timestamp must be a valid date");
  }
};

const toTwoDigits = (value: number): string => String(value).padStart(2, "0");

export const formatConversationSessionLogTimestamp = (input: Date | number): string => {
  const date = typeof input === "number" ? new Date(input) : input;
  assertValidDate(date);

  const year = date.getFullYear();
  const month = toTwoDigits(date.getMonth() + 1);
  const day = toTwoDigits(date.getDate());
  const hours24 = date.getHours();
  const hours12 = hours24 % 12 || 12;
  const minute = toTwoDigits(date.getMinutes());
  const second = toTwoDigits(date.getSeconds());
  const period = hours24 >= 12 ? "PM" : "AM";

  return `${year}-${month}-${day} ${toTwoDigits(hours12)}:${minute}:${second} ${period}`;
};

export const createConversationSessionLogSessionId = (now = () => new Date()): string => {
  const value = now();
  assertValidDate(value);

  return [
    toTwoDigits(value.getDate()),
    toTwoDigits(value.getMonth() + 1),
    toTwoDigits(value.getHours()),
    toTwoDigits(value.getMinutes()),
  ].join("-");
};

export const createConversationSessionLogSessionPath = (input: {
  repoRoot: string;
  sessionId: string;
}): string => {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(input.sessionId)) {
    throw new Error("Conversation session log sessionId must be path-safe");
  }

  return join(input.repoRoot, `${input.sessionId}.md`);
};

const toMarkdownHeader = (
  sessionId: string,
  startedAt: Date,
  entry: ConversationSessionLogEntryBase,
): string => [
  "# Conversation Session Log",
  "",
  `- Session ID: \`${sessionId}\``,
  `- Company ID: \`${entry.companyId}\``,
  `- Conversation ID: \`${entry.conversationId}\``,
  `- Started At: \`${formatConversationSessionLogTimestamp(startedAt)}\``,
  "",
].join("\n");

const isAlreadyExistsError = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  (error as { code?: unknown }).code === "EEXIST";

const toIndentedMarkdownBlock = (value: string): string =>
  value
    .split(/\r\n|\n|\r/)
    .map((line) => `    ${line}`)
    .join("\n");

const formatEntryLine = (entry: ConversationSessionLogEntry): string => {
  const timestamp = formatConversationSessionLogTimestamp(entry.timestamp);

  if (entry.kind === "cv") {
    return `- [CV] ${timestamp} actor=${entry.actor}\n\n${toIndentedMarkdownBlock(entry.text)}\n`;
  }

  return `- [BTS] ${timestamp} event=${entry.event}\n\n${toIndentedMarkdownBlock(entry.details)}\n`;
};

export const createConversationSessionLog = (
  options: CreateConversationSessionLogOptions,
): ConversationSessionLogWriter => {
  let initialized = false;
  let writeQueue: Promise<void> = Promise.resolve();
  const startedAt = options.startedAt ?? new Date();
  let conversationIdentity: Pick<ConversationSessionLogEntryBase, "companyId" | "conversationId"> | undefined;

  const assertSingleConversationIdentity = (entry: ConversationSessionLogEntryBase): void => {
    if (!conversationIdentity) {
      conversationIdentity = {
        companyId: entry.companyId,
        conversationId: entry.conversationId,
      };
      return;
    }

    if (
      conversationIdentity.companyId !== entry.companyId
      || conversationIdentity.conversationId !== entry.conversationId
    ) {
      throw new Error("Conversation session log supports one company conversation per session");
    }
  };

  const ensureHeader = async (entry: ConversationSessionLogEntryBase) => {
    if (initialized) {
      return;
    }

    assertSingleConversationIdentity(entry);
    await mkdir(dirname(options.filePath), { recursive: true });

    try {
      await writeFile(options.filePath, toMarkdownHeader(options.sessionId, startedAt, entry), { flag: "wx" });
    } catch (error) {
      if (!isAlreadyExistsError(error)) {
        throw error;
      }
    }

    initialized = true;
  };

  return {
    append(entry) {
      const nextWrite = writeQueue.then(async () => {
        const formattedEntry = `${formatEntryLine(entry)}\n`;
        assertSingleConversationIdentity(entry);
        await ensureHeader(entry);
        await appendFile(options.filePath, formattedEntry);
      });

      writeQueue = nextWrite.catch(() => undefined);
      return nextWrite;
    },
  };
};

export const createConversationSessionLogFromEnv = (
  env: NodeJS.ProcessEnv = process.env,
): ConversationSessionLogWriter | undefined => {
  const sessionId = env.CONVERSATION_LOG_SESSION_ID;
  const filePath = env.CONVERSATION_LOG_SESSION_PATH;

  return sessionId && filePath
    ? createConversationSessionLog({
      filePath,
      sessionId,
    })
    : undefined;
};

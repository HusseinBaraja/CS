import { type BotRuntimeOperatorSnapshot, ERROR_CODES, type ErrorCode } from '@cs/shared';

export type { BotRuntimeOperatorSnapshot } from '@cs/shared';

export interface BotRuntimeService {
  listOperatorSnapshots(): Promise<BotRuntimeOperatorSnapshot[]>;
}

export class BotRuntimeServiceError extends Error {
  readonly code: ErrorCode;
  readonly status: number;

  constructor(
    code: ErrorCode,
    message: string,
    status: number = 503,
    options: { cause?: unknown } = {},
  ) {
    super(message);
    this.name = "BotRuntimeServiceError";
    this.code = code;
    this.status = status;
    if (options.cause !== undefined) {
      Object.defineProperty(this, "cause", {
        configurable: true,
        enumerable: false,
        value: options.cause,
        writable: true,
      });
    }
  }
}

export const createDatabaseServiceError = (cause?: unknown): BotRuntimeServiceError =>
  new BotRuntimeServiceError(
    ERROR_CODES.DB_QUERY_FAILED,
    "Bot runtime data is temporarily unavailable",
    503,
    { cause },
  );

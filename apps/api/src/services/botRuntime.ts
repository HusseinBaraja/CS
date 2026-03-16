import { type BotRuntimeOperatorSnapshot, ERROR_CODES, type ErrorCode } from '@cs/shared';

export type { BotRuntimeOperatorSnapshot } from '@cs/shared';

export interface BotRuntimeService {
  listOperatorSnapshots(): Promise<BotRuntimeOperatorSnapshot[]>;
}

export class BotRuntimeServiceError extends Error {
  readonly code: ErrorCode;
  readonly status: 503;

  constructor(
    code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "BotRuntimeServiceError";
    this.code = code;
    this.status = 503;
  }
}

export const createDatabaseServiceError = (message: string): BotRuntimeServiceError =>
  new BotRuntimeServiceError(ERROR_CODES.DB_QUERY_FAILED, message);

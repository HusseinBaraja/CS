import type { ConversationRecordDto, ErrorCode } from '@cs/shared';
import { ERROR_CODES } from '@cs/shared';

export type { ConversationRecordDto } from '@cs/shared';

export interface HandoffConversationInput {
  companyId: string;
  phoneNumber: string;
  reason?: string;
}

export interface ResumeConversationInput {
  companyId: string;
  phoneNumber: string;
  reason?: string;
}

export interface ConversationsService {
  handoffConversation(input: HandoffConversationInput): Promise<ConversationRecordDto | null>;
  resumeConversation(input: ResumeConversationInput): Promise<ConversationRecordDto | null>;
}

export class ConversationsServiceError extends Error {
  readonly code: ErrorCode;
  readonly status: 400 | 404 | 503;

  constructor(
    code: ErrorCode,
    message: string,
    status: 400 | 404 | 503,
  ) {
    super(message);
    this.name = "ConversationsServiceError";
    this.code = code;
    this.status = status;
  }
}

export const createValidationServiceError = (message: string): ConversationsServiceError =>
  new ConversationsServiceError(ERROR_CODES.VALIDATION_FAILED, message, 400);

export const createNotFoundServiceError = (message: string): ConversationsServiceError =>
  new ConversationsServiceError(ERROR_CODES.NOT_FOUND, message, 404);

export const createDatabaseServiceError = (message: string): ConversationsServiceError =>
  new ConversationsServiceError(ERROR_CODES.DB_QUERY_FAILED, message, 503);

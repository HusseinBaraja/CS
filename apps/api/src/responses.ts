import type { ErrorCode } from '@cs/shared';

export interface ApiErrorResponse {
  ok: false;
  error: {
    code: ErrorCode | string;
    message: string;
  };
}

export const createErrorResponse = (
  code: ErrorCode | string,
  message: string
): ApiErrorResponse => ({
  ok: false,
  error: {
    code,
    message
  }
});

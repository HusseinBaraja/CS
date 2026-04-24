import type { ErrorCode } from '@cs/shared';

interface ApiErrorResponse {
  ok: false;
  error: {
    code: ErrorCode | string;
    message: string;
  };
}

export const createErrorResponse = (
  code: ErrorCode,
  message: string
): ApiErrorResponse => ({
  ok: false,
  error: {
    code,
    message
  }
});

// Use this only for framework-level fallbacks that intentionally sit outside the
// shared ErrorCode contract.
export const createCustomErrorResponse = (
  code: string,
  message: string
): ApiErrorResponse => ({
  ok: false,
  error: {
    code,
    message
  }
});

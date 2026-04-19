type RetryableConvexTransportErrorLike = Error & { code?: unknown };

const TRANSIENT_CONVEX_ERROR_CODES = new Set(["ECONNRESET", "ETIMEDOUT", "EAI_AGAIN"]);
const TRANSIENT_CONVEX_SOCKET_CLOSE_MESSAGE = "The socket connection was closed unexpectedly";

export const isTransientConvexTransportError = (
  error: unknown,
  extraCodes?: Iterable<string>,
): boolean => {
  if (!(error instanceof Error)) {
    return false;
  }

  const transientCodes = extraCodes
    ? new Set([...TRANSIENT_CONVEX_ERROR_CODES, ...extraCodes])
    : TRANSIENT_CONVEX_ERROR_CODES;
  const errorWithCode = error as RetryableConvexTransportErrorLike;
  if (typeof errorWithCode.code === "string" && transientCodes.has(errorWithCode.code)) {
    return true;
  }

  return error.message.includes(TRANSIENT_CONVEX_SOCKET_CLOSE_MESSAGE);
};

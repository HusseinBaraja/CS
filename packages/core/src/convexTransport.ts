type RetryableConvexTransportErrorLike = Error & { code?: unknown; cause?: unknown };

const TRANSIENT_CONVEX_ERROR_CODES = new Set([
  "ECONNRESET",
  "ETIMEDOUT",
  "EAI_AGAIN",
  "UND_ERR_CONNECT_TIMEOUT",
]);
const TRANSIENT_CONVEX_MESSAGE_PATTERNS = [
  "The socket connection was closed unexpectedly",
  "Unable to connect. Is the computer able to access the url?",
  "Connect Timeout Error",
] as const;
const MAX_CAUSE_DEPTH = 6;

const getErrorChain = (error: Error): Error[] => {
  const chain: Error[] = [];
  let current: unknown = error;
  let depth = 0;

  while (current instanceof Error && depth < MAX_CAUSE_DEPTH) {
    chain.push(current);
    current = (current as RetryableConvexTransportErrorLike).cause;
    depth += 1;
  }

  return chain;
};

const hasTransientMessage = (message: string): boolean =>
  TRANSIENT_CONVEX_MESSAGE_PATTERNS.some((pattern) => message.includes(pattern));

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
  const chain = getErrorChain(error);

  for (const chainError of chain) {
    const errorWithCode = chainError as RetryableConvexTransportErrorLike;
    if (typeof errorWithCode.code === "string" && transientCodes.has(errorWithCode.code)) {
      return true;
    }

    if (hasTransientMessage(chainError.message)) {
      return true;
    }
  }

  return false;
};

import { isTransientConvexTransportError } from '@cs/core';

const INITIAL_RECONCILE_RETRY_DELAYS_MS = [250, 500, 1_000] as const;

const sleep = (delayMs: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });

export const retryInitialSessionReconcile = async (
  runReconcile: () => Promise<void>,
  onRetry: (input: {
    attempt: number;
    retryDelayMs: number;
    error: unknown;
  }) => void,
): Promise<void> => {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await runReconcile();
      return;
    } catch (error) {
      const retryDelayMs = INITIAL_RECONCILE_RETRY_DELAYS_MS[attempt];
      if (!isTransientConvexTransportError(error) || retryDelayMs === undefined) {
        throw error;
      }

      onRetry({
        attempt: attempt + 1,
        retryDelayMs,
        error,
      });
      await sleep(retryDelayMs);
    }
  }
};

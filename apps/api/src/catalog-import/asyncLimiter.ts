export const createAsyncLimiter = (maxConcurrency: number): (<T>(task: () => Promise<T>) => Promise<T>) => {
  if (!Number.isFinite(maxConcurrency) || !Number.isInteger(maxConcurrency) || maxConcurrency < 1) {
    throw new RangeError('maxConcurrency must be a finite integer greater than or equal to 1');
  }

  let active = 0;
  const queue: Array<() => void> = [];

  const acquire = async (): Promise<void> => {
    if (active < maxConcurrency) {
      active += 1;
      return;
    }

    await new Promise<void>((resolve) => {
      queue.push(() => {
        active += 1;
        resolve();
      });
    });
  };

  const release = (): void => {
    active -= 1;
    const next = queue.shift();
    if (next) {
      next();
    }
  };

  return async <T>(task: () => Promise<T>): Promise<T> => {
    await acquire();
    try {
      return await task();
    } finally {
      release();
    }
  };
};

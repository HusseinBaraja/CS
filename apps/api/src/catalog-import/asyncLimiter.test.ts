import { describe, expect, test } from 'vitest';
import { createAsyncLimiter } from './asyncLimiter';

describe('createAsyncLimiter', () => {
  test('rejects invalid concurrency limits', () => {
    for (const maxConcurrency of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => createAsyncLimiter(maxConcurrency)).toThrow(
        new RangeError('maxConcurrency must be a finite integer greater than or equal to 1'),
      );
    }
  });

  test('runs tasks when concurrency limit is valid', async () => {
    const limit = createAsyncLimiter(1);

    await expect(limit(async () => 'ok')).resolves.toBe('ok');
  });
});

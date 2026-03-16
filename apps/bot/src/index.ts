import { logger } from '@cs/core';
import { startBot } from './runtime';

if (import.meta.main) {
  startBot().catch((error) => {
    logger.error({ error }, "bot startup failed");
    process.exitCode = 1;
  });
}

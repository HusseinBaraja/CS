import { logger } from '@cs/core';
import { startTenantSessionManager } from './sessionManager';

if (import.meta.main) {
  startTenantSessionManager().catch((error) => {
    logger.error({ error }, "bot startup failed");
    process.exitCode = 1;
  });
}

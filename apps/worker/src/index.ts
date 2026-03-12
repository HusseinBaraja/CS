import { logger } from '@cs/core';
import { createDbConnection, getDbConnectionInfo } from '@cs/db';
import { createMediaCleanupProcessor } from './mediaCleanup';

const startWorker = async (): Promise<void> => {
  logger.info({ db: getDbConnectionInfo(createDbConnection()) }, "worker initialized");

  const mediaCleanup = createMediaCleanupProcessor();
  await mediaCleanup.runTick();
  mediaCleanup.start();
};

if (import.meta.main) {
  startWorker().catch((error) => {
    logger.error({ error }, "worker startup failed");
    process.exitCode = 1;
  });
}

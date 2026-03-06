import { logger } from '@cs/core';
import { createDbConnection, getDbConnectionInfo } from '@cs/db';

logger.info({ db: getDbConnectionInfo(createDbConnection()) }, "worker initialized");

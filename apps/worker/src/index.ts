import { logger } from "@cs/core";
import { createDbConnection } from "@cs/db";

logger.info({ db: createDbConnection() }, "worker initialized");

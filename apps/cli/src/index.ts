#!/usr/bin/env bun
import { env } from "@cs/config";
import { logger } from "@cs/core";

logger.info({ env: env.NODE_ENV }, "cli ready");

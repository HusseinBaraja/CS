import { serve } from '@hono/node-server';
import { env } from '@cs/config';
import { logger } from '@cs/core';
import { createApp } from './app';

const app = createApp();

serve({ fetch: app.fetch, port: env.API_PORT });
logger.info({ port: env.API_PORT }, "api started");

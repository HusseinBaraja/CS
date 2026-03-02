import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { env } from "@cs/config";
import { logger } from "@cs/core";
import { createDbConnection } from "@cs/db";

const app = new Hono();

app.get("/api/health", (c) => {
  return c.json({
    ok: true,
    runtime: "api",
    db: createDbConnection()
  });
});

serve({ fetch: app.fetch, port: env.API_PORT });
logger.info({ port: env.API_PORT }, "api started");

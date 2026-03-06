import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { env } from "@cs/config";
import { logger } from "@cs/core";
import { createDbConnection } from "@cs/db";

const app = new Hono();
const db = createDbConnection();

app.get("/api/health", (c) => {
  return c.json({
    ok: true,
    runtime: "api",
    db
  });
});

serve({ fetch: app.fetch, port: env.API_PORT });
logger.info({ port: env.API_PORT }, "api started");

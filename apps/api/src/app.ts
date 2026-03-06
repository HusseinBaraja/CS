import { Hono } from 'hono';
import { createDbConnection, DB_PROVIDER, type DbConnection, getDbConnectionInfo } from '@cs/db';

export interface ApiAppOptions {
  createDbConnection?: () => DbConnection;
}

export const createApp = (options: ApiAppOptions = {}) => {
  const app = new Hono();
  const connectToDb = options.createDbConnection ?? createDbConnection;

  app.get("/api/health", (c) =>
    c.json({
      ok: true,
      runtime: "api"
    })
  );

  app.get("/api/ready", (c) => {
    try {
      const db = connectToDb();

      return c.json({
        ok: true,
        runtime: "api",
        dependencies: {
          db: {
            ...getDbConnectionInfo(db),
            ready: true
          }
        }
      });
    } catch {
      return c.json(
        {
          ok: false,
          runtime: "api",
          dependencies: {
            db: {
              provider: DB_PROVIDER,
              ready: false
            }
          }
        },
        503
      );
    }
  });

  return app;
};

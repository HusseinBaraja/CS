import { requireEnv } from '@cs/config';

export const DB_PROVIDER = "convex";

export interface DbConnection {
  provider: typeof DB_PROVIDER;
  url: string;
}

export interface DbConnectionInfo {
  provider: typeof DB_PROVIDER;
}

export const createDbConnection = (): DbConnection => ({
  provider: DB_PROVIDER,
  url: requireEnv("CONVEX_URL")
});

export const getDbConnectionInfo = (
  connection: Pick<DbConnection, "provider">
): DbConnectionInfo => ({
  provider: connection.provider
});

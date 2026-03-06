import { ERROR_CODES } from '@cs/shared';
import { requireEnv } from '@cs/config';
import { version as convexVersion } from 'convex';

export const DB_PROVIDER = "convex";
const QUERY_TIMESTAMP_PATH = "/api/query_ts";

export interface DbConnection {
  provider: typeof DB_PROVIDER;
  url: string;
}

export interface DbConnectionInfo {
  provider: typeof DB_PROVIDER;
}

export interface DbConnectionCheckOptions {
  fetch?: (input: URL | RequestInfo, init?: RequestInit) => Promise<Response>;
}

const createConnectionError = (cause?: unknown): Error & { code: string } => {
  const error = new Error("Database connection failed", { cause }) as Error & { code: string };
  error.code = ERROR_CODES.DB_CONNECTION_FAILED;
  return error;
};

export const createDbConnection = (): DbConnection => ({
  provider: DB_PROVIDER,
  url: requireEnv("CONVEX_URL")
});

export const checkDbConnection = async (
  connection: DbConnection,
  options: DbConnectionCheckOptions = {}
): Promise<void> => {
  const fetchImpl = options.fetch ?? globalThis.fetch;

  if (!fetchImpl) {
    throw createConnectionError(new Error("Fetch is not available in this runtime"));
  }

  let response: Response;
  try {
    response = await fetchImpl(`${connection.url}${QUERY_TIMESTAMP_PATH}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Convex-Client": `npm-${convexVersion}`
      }
    });
  } catch (error) {
    throw createConnectionError(error);
  }

  if (!response.ok) {
    throw createConnectionError(new Error(`Unexpected response status: ${response.status}`));
  }

  try {
    const payload = await response.json();
    if (!payload || typeof payload !== "object" || !("ts" in payload)) {
      throw new Error("Missing timestamp in readiness response");
    }
  } catch (error) {
    throw createConnectionError(error);
  }
};

export const getDbConnectionInfo = (
  connection: Pick<DbConnection, "provider">
): DbConnectionInfo => ({
  provider: connection.provider
});

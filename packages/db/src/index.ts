import { ERROR_CODES } from "@cs/shared";
import { requireEnv } from "@cs/config";
import { version as convexVersion } from "convex";

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
  timeoutMs?: number;
}

const createConnectionError = (cause?: unknown): Error & { code: string } => {
  const error = new Error("Database connection failed", { cause }) as Error & {
    code: string;
  };
  error.code = ERROR_CODES.DB_CONNECTION_FAILED;
  return error;
};

export const createDbConnection = (): DbConnection => ({
  provider: DB_PROVIDER,
  url: requireEnv("CONVEX_URL"),
});

export const checkDbConnection = async (
  connection: DbConnection,
  options: DbConnectionCheckOptions = {},
): Promise<void> => {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? 3000;

  if (!fetchImpl) {
    throw createConnectionError(
      new Error("Fetch is not available in this runtime"),
    );
  }

  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetchImpl(`${connection.url}${QUERY_TIMESTAMP_PATH}`, {
      method: "POST",
      signal: abortController.signal,
      headers: {
        "Content-Type": "application/json",
        "Convex-Client": `npm-${convexVersion}`,
      },
    });
  } catch (error) {
    throw createConnectionError(error);
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    throw createConnectionError(
      new Error(`Unexpected response status: ${response.status}`),
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    throw createConnectionError(error);
  }

  if (!payload || typeof payload !== "object" || !("ts" in payload)) {
    throw createConnectionError(
      new Error("Missing timestamp in readiness response"),
    );
  }
};

export const getDbConnectionInfo = (
  connection: Pick<DbConnection, "provider">,
): DbConnectionInfo => ({
  provider: connection.provider,
});

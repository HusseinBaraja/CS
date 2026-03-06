import { requireEnv } from "@cs/config";

export interface DbConnection {
  provider: "convex";
  url: string;
}

export const createDbConnection = (): DbConnection => ({
  provider: "convex",
  url: requireEnv("CONVEX_URL")
});

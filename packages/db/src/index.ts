export interface DbConnection {
  provider: "convex";
  url?: string;
}

export const createDbConnection = (): DbConnection => ({
  provider: "convex",
  url: process.env.CONVEX_URL
});

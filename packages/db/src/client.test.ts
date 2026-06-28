import { describe, expect, test } from "vitest";
import { createConvexAdminClient } from "./client";

describe("@cs/db client helpers", () => {
  test("createConvexAdminClient configures admin auth when explicit arguments are provided", () => {
    const client = createConvexAdminClient("https://example.convex.cloud", "admin-token") as unknown as {
      url: string;
      adminAuth?: string;
    };

    expect(client.url).toBe("https://example.convex.cloud");
    expect(client.adminAuth).toBe("admin-token");
  });
});

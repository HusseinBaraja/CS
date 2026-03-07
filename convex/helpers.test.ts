import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "./schema";
import { getCompanyOrThrow } from "./helpers";

const modules = import.meta.glob("./**/*.ts");

describe("helpers", () => {
  describe("getCompanyOrThrow", () => {
    it("returns the company when it exists", async () => {
      const t = convexTest(schema, modules);
      const companyId = await t.run(async (ctx) => {
        return ctx.db.insert("companies", {
          name: "Test Company",
          ownerPhone: "966500000000",
        });
      });

      const company = await t.run(async (ctx) => {
        return getCompanyOrThrow(ctx, companyId);
      });

      expect(company).toMatchObject({
        name: "Test Company",
        ownerPhone: "966500000000",
      });
    });

    it("throws when the company does not exist", async () => {
      const t = convexTest(schema, modules);
      // Generate a fake ID (this is a bit hacky in convex-test but should work if we just use a random string of correct format)
      // Actually, better to just use a valid ID format but one that doesn't exist.
      const fakeId = "kd7bhf43p6er3m8x8q2z0v1b5s6jyxv" as any;

      await expect(
        t.run(async (ctx) => {
          // @ts-ignore - intentional invalid ID for testing throw
          return getCompanyOrThrow(ctx, fakeId);
        }),
      ).rejects.toThrow(`Company ${fakeId as string} not found`);
    });
  });
});

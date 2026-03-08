import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "./schema";
import { getCompanyOrThrow } from "./helpers";

if (typeof import.meta.glob !== "function") {
  throw new Error("This suite requires import.meta.glob support.");
}

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
      const deletedId = await t.run(async (ctx) => {
        const id = await ctx.db.insert("companies", {
          name: "Deleted Company",
          ownerPhone: "966500000001",
        });
        await ctx.db.delete(id);
        return id;
      });

      await expect(
        t.run(async (ctx) => {
          return getCompanyOrThrow(ctx, deletedId);
        }),
      ).rejects.toThrow(`Company ${deletedId} not found`);
    });
  });
});

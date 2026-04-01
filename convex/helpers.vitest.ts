import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import schema from './schema';
import { getCompanyOrThrow } from './helpers';
import { createCompany, createDeletedCompany } from './testFixtures';

const modules =
  typeof import.meta.glob === "function"
    ? import.meta.glob(["./**/*.ts", "!./**/*.vitest.ts", "!./vitest.config.ts"])
    : ({} as Record<string, () => Promise<any>>);

describe.skipIf(typeof import.meta.glob !== "function")("helpers", () => {
  describe("getCompanyOrThrow", () => {
    it("returns the company when it exists", async () => {
      const t = convexTest(schema, modules);
      const { companyId, company: createdCompany } = await t.run(async (ctx) =>
        createCompany(ctx, {
          name: "Test Company",
        }),
      );

      const company = await t.run(async (ctx) => {
        return getCompanyOrThrow(ctx, companyId);
      });

      expect(company).toMatchObject({
        name: createdCompany.name,
        ownerPhone: createdCompany.ownerPhone,
      });
    });

    it("throws when the company does not exist", async () => {
      const t = convexTest(schema, modules);
      const { companyId: deletedId } = await t.run(async (ctx) =>
        createDeletedCompany(ctx, {
          name: "Deleted Company",
        }),
      );

      await expect(
        t.run(async (ctx) => {
          return getCompanyOrThrow(ctx, deletedId);
        }),
      ).rejects.toThrow(`Company ${deletedId} not found`);
    });
  });
});

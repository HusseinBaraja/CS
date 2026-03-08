import { Doc, Id } from "./_generated/dataModel";
import { DatabaseReader } from "./_generated/server";

/**
 * Fetch a company by ID or throw an error if it doesn't exist.
 */
export async function getCompanyOrThrow(
  ctx: { db: DatabaseReader },
  companyId: Id<"companies">,
): Promise<Doc<"companies">> {
  const company = await ctx.db.get("companies", companyId);
  if (!company) {
    throw new Error(`Company ${companyId} not found`);
  }
  return company;
}

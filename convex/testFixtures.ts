import type { Doc, Id } from './_generated/dataModel';

type InsertableDoc<T extends "companies" | "categories" | "products" | "productVariants"> = Omit<
  Doc<T>,
  "_id" | "_creationTime"
>;

type TestDbCtx = {
  db: any;
};

const OWNER_PHONE_COUNTER_START = 966500000000n;
let ownerPhoneCounter = OWNER_PHONE_COUNTER_START;

export const nextOwnerPhone = (): string => {
  const ownerPhone = ownerPhoneCounter.toString();
  ownerPhoneCounter += 1n;
  return ownerPhone;
};

export const resetOwnerPhoneCounter = (
  start: bigint = OWNER_PHONE_COUNTER_START,
): void => {
  ownerPhoneCounter = start;
};

export const createCompany = async (
  ctx: TestDbCtx,
  overrides: Partial<InsertableDoc<"companies">> = {},
): Promise<{
  companyId: Id<"companies">;
  company: InsertableDoc<"companies">;
}> => {
  const {
    name = "Test Company",
    ownerPhone = nextOwnerPhone(),
    ...rest
  } = overrides;

  const company = {
    name,
    ownerPhone,
    ...rest,
  };
  const companyId = await ctx.db.insert("companies", company) as Id<"companies">;

  return {
    companyId,
    company,
  };
};

export const createDeletedCompany = async (
  ctx: TestDbCtx,
  overrides: Partial<InsertableDoc<"companies">> = {},
): Promise<{
  companyId: Id<"companies">;
  company: InsertableDoc<"companies">;
}> => {
  const created = await createCompany(ctx, overrides);
  await ctx.db.delete(created.companyId);
  return created;
};

export const createCategory = async (
  ctx: TestDbCtx,
  input: {
    companyId: Id<"companies">;
  } & Partial<Omit<InsertableDoc<"categories">, "companyId">>,
): Promise<{
  categoryId: Id<"categories">;
  category: InsertableDoc<"categories">;
}> => {
  const {
    companyId,
    nameEn = "Category",
    ...rest
  } = input;

  const category = {
    companyId,
    nameEn,
    ...rest,
  };
  const categoryId = await ctx.db.insert("categories", category) as Id<"categories">;

  return {
    categoryId,
    category,
  };
};

export const createProduct = async (
  ctx: TestDbCtx,
  input: {
    companyId: Id<"companies">;
    categoryId: Id<"categories">;
  } & Partial<Omit<InsertableDoc<"products">, "companyId" | "categoryId">>,
): Promise<{
  productId: Id<"products">;
  product: InsertableDoc<"products">;
}> => {
  const {
    companyId,
    categoryId,
    nameEn = "Product",
    ...rest
  } = input;

  const product = {
    companyId,
    categoryId,
    nameEn,
    ...rest,
  };
  const productId = await ctx.db.insert("products", product) as Id<"products">;

  return {
    productId,
    product,
  };
};

export const createVariant = async (
  ctx: TestDbCtx,
  input: {
    companyId?: Id<"companies">;
    productId: Id<"products">;
  } & Partial<Omit<InsertableDoc<"productVariants">, "companyId" | "productId">>,
): Promise<{
  variantId: Id<"productVariants">;
  variant: InsertableDoc<"productVariants">;
}> => {
  const {
    companyId,
    productId,
    labelEn = "Variant",
    ...rest
  } = input;

  const product = await ctx.db.get(productId) as Doc<"products"> | null;
  if (!product) {
    throw new Error(`Cannot create variant for missing product: ${productId}`);
  }
  if (companyId !== undefined && companyId !== product.companyId) {
    throw new Error("Variant companyId must match the product companyId");
  }

  const variant = {
    companyId: product.companyId,
    productId,
    labelEn,
    ...rest,
  };
  const variantId = await ctx.db.insert("productVariants", variant) as Id<"productVariants">;

  return {
    variantId,
    variant,
  };
};

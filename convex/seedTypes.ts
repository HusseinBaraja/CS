import type { Id } from './_generated/dataModel';

export type SeedInsertResult = {
  companyId: Id<"companies">;
  companyName: string;
  counts: {
    categories: number;
    embeddings: number;
    currencyRates: number;
    offers: number;
    productUnits: number;
    products: number;
  };
};

export type SeedProductEmbeddingSnapshot = {
  productId: Id<"products">;
  companyId: Id<"companies">;
  categoryId: Id<"categories">;
  nameEn?: string;
  nameAr?: string;
  descriptionEn?: string;
  descriptionAr?: string;
  price?: number;
  currency?: string;
  units: Array<{
    id: Id<"productUnits">;
    productId: Id<"products">;
    labelEn?: string;
    labelAr?: string;
    price: number;
  }>;
};

export type SeedActionResult = SeedInsertResult & {
  clearedCompanies: number;
};

export type LockAcquireResult = {
  acquired: boolean;
  waitMs: number;
};

export type LockRenewResult = {
  renewed: boolean;
};

export type SeedCompanySkeletonResult = {
  companyId: Id<"companies">;
  companyName: string;
};

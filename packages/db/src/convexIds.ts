import type { Id } from "@cs/convex/_generated/dataModel";

const CONVEX_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

export class ConvexIdValidationError extends Error {
  constructor(
    public readonly tableName: string,
    public readonly rawValue: string,
  ) {
    super(
      `Invalid ${tableName} id "${rawValue}": expected a non-empty identifier containing only letters, numbers, "_" or "-"`,
    );
    this.name = "ConvexIdValidationError";
  }
}

const toConvexId = <TableName extends keyof IdTableMap>(
  tableName: TableName,
  rawValue: string,
): IdTableMap[TableName] => {
  const normalizedValue = rawValue.trim();
  if (normalizedValue.length === 0 || !CONVEX_ID_PATTERN.test(normalizedValue)) {
    throw new ConvexIdValidationError(tableName, rawValue);
  }

  return normalizedValue as IdTableMap[TableName];
};

interface IdTableMap {
  categories: Id<"categories">;
  companies: Id<"companies">;
  conversations: Id<"conversations">;
  messages: Id<"messages">;
  products: Id<"products">;
  productVariants: Id<"productVariants">;
}

export const toCategoryId = (categoryId: string): Id<"categories"> =>
  toConvexId("categories", categoryId);

export const toCompanyId = (companyId: string): Id<"companies"> =>
  toConvexId("companies", companyId);

export const toConversationId = (conversationId: string): Id<"conversations"> =>
  toConvexId("conversations", conversationId);

export const toMessageId = (messageId: string): Id<"messages"> =>
  toConvexId("messages", messageId);

export const toProductId = (productId: string): Id<"products"> =>
  toConvexId("products", productId);

export const toVariantId = (variantId: string): Id<"productVariants"> =>
  toConvexId("productVariants", variantId);

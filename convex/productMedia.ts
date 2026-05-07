import { v } from 'convex/values';
import { PRODUCT_IMAGE_ALLOWED_MIME_TYPES, PRODUCT_IMAGE_MAX_SIZE_BYTES } from '@cs/storage';
import { enqueueCleanupJobInMutation } from './mediaCleanup';
import type { Doc, Id } from './_generated/dataModel';
import { internalMutation, internalQuery } from './_generated/server';

const NOT_FOUND_PREFIX = "NOT_FOUND";
const VALIDATION_PREFIX = "VALIDATION_FAILED";

type ProductImageContentType = (typeof PRODUCT_IMAGE_ALLOWED_MIME_TYPES)[number];

const createTaggedError = (prefix: string, message: string): Error =>
  new Error(`${prefix}: ${message}`);

const normalizeOptionalString = (value: string | null | undefined): string | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
};

const normalizeContentType = (value: string): ProductImageContentType => {
  const normalized = value.trim().toLowerCase();

  if (!PRODUCT_IMAGE_ALLOWED_MIME_TYPES.includes(normalized as ProductImageContentType)) {
    throw createTaggedError(
      VALIDATION_PREFIX,
      `contentType must be one of: ${PRODUCT_IMAGE_ALLOWED_MIME_TYPES.join(", ")}`,
    );
  }

  return normalized as ProductImageContentType;
};

const getFileExtension = (contentType: ProductImageContentType): string => {
  switch (contentType) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    default:
      throw createTaggedError(VALIDATION_PREFIX, `Unsupported content type: ${contentType}`);
  }
};

const getScopedProduct = async (
  ctx: { db: { get: (id: Id<"products">) => Promise<Doc<"products"> | null> } },
  companyId: Id<"companies">,
  productId: Id<"products">,
): Promise<Doc<"products"> | null> => {
  const product = await ctx.db.get(productId);
  if (!product || product.companyId !== companyId) {
    return null;
  }

  return product;
};

export const createUploadSession = internalMutation({
  args: {
    companyId: v.id("companies"),
    productId: v.id("products"),
    contentType: v.string(),
    alt: v.optional(v.string()),
    maxSizeBytes: v.number(),
    createdAt: v.number(),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    const product = await getScopedProduct(ctx, args.companyId, args.productId);
    if (!product) {
      return null;
    }

    const contentType = normalizeContentType(args.contentType);
    if (!Number.isInteger(args.maxSizeBytes) || args.maxSizeBytes <= 0 || args.maxSizeBytes > PRODUCT_IMAGE_MAX_SIZE_BYTES) {
      throw createTaggedError(
        VALIDATION_PREFIX,
        `maxSizeBytes must be between 1 and ${PRODUCT_IMAGE_MAX_SIZE_BYTES}`,
      );
    }

    if (args.expiresAt <= args.createdAt) {
      throw createTaggedError(VALIDATION_PREFIX, "expiresAt must be after createdAt");
    }

    const imageId = crypto.randomUUID();
    const objectKey = `companies/${args.companyId}/products/${args.productId}/${imageId}.${getFileExtension(contentType)}`;
    const uploadId = await ctx.db.insert("productImageUploads", {
      companyId: args.companyId,
      productId: args.productId,
      imageId,
      objectKey,
      intendedContentType: contentType,
      maxSizeBytes: args.maxSizeBytes,
      ...(normalizeOptionalString(args.alt) ? { alt: normalizeOptionalString(args.alt) } : {}),
      status: "pending",
      createdAt: args.createdAt,
      expiresAt: args.expiresAt,
    });

    return {
      uploadId,
      imageId,
      objectKey,
      expiresAt: args.expiresAt,
    };
  },
});

export const completeUploadSession = internalMutation({
  args: {
    companyId: v.id("companies"),
    productId: v.id("products"),
    uploadId: v.id("productImageUploads"),
    observedContentType: v.string(),
    sizeBytes: v.number(),
    etag: v.optional(v.string()),
    completedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const product = await getScopedProduct(ctx, args.companyId, args.productId);
    if (!product) {
      return null;
    }

    const upload = await ctx.db.get(args.uploadId);
    if (!upload || upload.companyId !== args.companyId || upload.productId !== args.productId) {
      return null;
    }

    if (upload.status === "completed") {
      return {
        id: upload.imageId,
        key: upload.objectKey,
        contentType: upload.intendedContentType,
        sizeBytes: upload.maxSizeBytes,
        ...(args.etag ? { etag: args.etag } : {}),
        ...(upload.alt ? { alt: upload.alt } : {}),
        uploadedAt: upload.completedAt ?? args.completedAt,
      };
    }

    if (upload.status !== "pending") {
      throw createTaggedError(VALIDATION_PREFIX, "Upload session is no longer pending");
    }

    if (upload.expiresAt < args.completedAt) {
      await ctx.db.patch(args.uploadId, {
        status: "expired",
      });
      await enqueueCleanupJobInMutation(ctx, {
        companyId: args.companyId,
        productId: args.productId,
        imageId: upload.imageId,
        objectKey: upload.objectKey,
        reason: "expired_upload_session",
        now: args.completedAt,
      });
      throw createTaggedError(VALIDATION_PREFIX, "Upload session expired");
    }

    const observedContentType = normalizeContentType(args.observedContentType);
    if (observedContentType !== upload.intendedContentType) {
      await ctx.db.patch(args.uploadId, {
        status: "expired",
      });
      await enqueueCleanupJobInMutation(ctx, {
        companyId: args.companyId,
        productId: args.productId,
        imageId: upload.imageId,
        objectKey: upload.objectKey,
        reason: "invalid_uploaded_object",
        now: args.completedAt,
      });
      throw createTaggedError(VALIDATION_PREFIX, "Uploaded object content type does not match the session");
    }

    if (!Number.isFinite(args.sizeBytes) || args.sizeBytes <= 0 || args.sizeBytes > upload.maxSizeBytes) {
      await ctx.db.patch(args.uploadId, {
        status: "expired",
      });
      await enqueueCleanupJobInMutation(ctx, {
        companyId: args.companyId,
        productId: args.productId,
        imageId: upload.imageId,
        objectKey: upload.objectKey,
        reason: "invalid_uploaded_object",
        now: args.completedAt,
      });
      throw createTaggedError(VALIDATION_PREFIX, "Uploaded object exceeds the allowed size");
    }

    // Clean up previous primaryImage if present
    if (product.primaryImage) {
      await enqueueCleanupJobInMutation(ctx, {
        companyId: args.companyId,
        productId: args.productId,
        objectKey: product.primaryImage,
        reason: "primary_image_replaced",
        now: args.completedAt,
      });
    }

    await ctx.db.patch(args.productId, {
      primaryImage: upload.objectKey,
    });
    await ctx.db.patch(args.uploadId, {
      status: "completed",
      completedAt: args.completedAt,
    });

    return {
      id: upload.imageId,
      key: upload.objectKey,
      contentType: observedContentType,
      sizeBytes: args.sizeBytes,
      ...(args.etag ? { etag: args.etag } : {}),
      ...(upload.alt ? { alt: upload.alt } : {}),
      uploadedAt: args.completedAt,
    };
  },
});

export const deleteImage = internalMutation({
  args: {
    companyId: v.id("companies"),
    productId: v.id("products"),
    deletedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const product = await getScopedProduct(ctx, args.companyId, args.productId);
    if (!product) {
      return null;
    }

    if (!product.primaryImage) {
      throw createTaggedError(NOT_FOUND_PREFIX, "Product has no primary image");
    }

    const objectKey = product.primaryImage;
    await ctx.db.patch(args.productId, {
      primaryImage: undefined,
    });

    await enqueueCleanupJobInMutation(ctx, {
      companyId: args.companyId,
      productId: args.productId,
      objectKey,
      reason: "product_image_deleted",
      now: args.deletedAt,
    });

    return {
      productId: args.productId,
      objectKey,
    };
  },
});

export const getUploadSession = internalQuery({
  args: {
    companyId: v.id("companies"),
    productId: v.id("products"),
    uploadId: v.id("productImageUploads"),
  },
  handler: async (ctx, args) => {
    const product = await getScopedProduct(ctx, args.companyId, args.productId);
    if (!product) {
      throw createTaggedError(NOT_FOUND_PREFIX, "Product not found");
    }

    const upload = await ctx.db.get(args.uploadId);
    if (!upload || upload.companyId !== args.companyId || upload.productId !== args.productId) {
      return null;
    }

    return upload;
  },
});

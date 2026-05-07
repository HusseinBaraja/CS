/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';
import { convexTest } from 'convex-test';
import { internal } from './_generated/api';
import schema from './schema';

const modules =
  typeof import.meta.glob === "function"
    ? import.meta.glob(["./**/*.ts", "!./**/*.vitest.ts", "!./vitest.config.ts"])
    : ({} as Record<string, () => Promise<any>>);

describe.skipIf(typeof import.meta.glob !== "function")("convex product media", () => {
  it("creates a scoped upload session with a stable object key", async () => {
    const t = convexTest(schema, modules);

    const { companyId, productId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", {
        name: "Tenant",
        ownerPhone: "966500000700",
      });
      const categoryId = await ctx.db.insert("categories", {
        companyId,
        nameEn: "Containers",
      });
      const productId = await ctx.db.insert("products", {
        companyId,
        categoryId,
        nameEn: "Burger Box",
      });

      return { companyId, productId };
    });

    const createdAt = Date.UTC(2026, 2, 12, 0, 0, 0);
    const expiresAt = createdAt + 15 * 60 * 1000;
    const upload = await t.mutation(internal.productMedia.createUploadSession, {
      companyId,
      productId,
      contentType: "image/jpeg",
      alt: "Front view",
      maxSizeBytes: 5 * 1024 * 1024,
      createdAt,
      expiresAt,
    });

    expect(upload).not.toBeNull();
    expect(upload?.objectKey).toContain(`companies/${companyId}/products/${productId}/`);
    expect(upload?.objectKey).toMatch(/\.jpg$/);

    const uploadDoc = await t.run(async (ctx) => ctx.db.get(upload!.uploadId));
    expect(uploadDoc).toMatchObject({
      companyId,
      productId,
      imageId: upload?.imageId,
      objectKey: upload?.objectKey,
      intendedContentType: "image/jpeg",
      status: "pending",
    });
  });

  it("completes an upload, attaches product metadata, and queues cleanup on image deletion", async () => {
    const t = convexTest(schema, modules);

    const { companyId, productId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", {
        name: "Tenant",
        ownerPhone: "966500000701",
      });
      const categoryId = await ctx.db.insert("categories", {
        companyId,
        nameEn: "Containers",
      });
      const productId = await ctx.db.insert("products", {
        companyId,
        categoryId,
        nameEn: "Burger Box",
      });

      return { companyId, productId };
    });

    const createdAt = Date.UTC(2026, 2, 12, 0, 0, 0);
    const completedAt = createdAt + 1_000;
    const upload = await t.mutation(internal.productMedia.createUploadSession, {
      companyId,
      productId,
      contentType: "image/png",
      maxSizeBytes: 5 * 1024 * 1024,
      createdAt,
      expiresAt: createdAt + 15 * 60 * 1000,
    });

    const image = await t.mutation(internal.productMedia.completeUploadSession, {
      companyId,
      productId,
      uploadId: upload!.uploadId,
      observedContentType: "image/png",
      sizeBytes: 2048,
      etag: '"etag-1"',
      completedAt,
    });

    expect(image).toEqual({
      id: upload!.imageId,
      key: upload!.objectKey,
      contentType: "image/png",
      sizeBytes: 2048,
      etag: '"etag-1"',
      uploadedAt: completedAt,
    });

    const productAfterAttach = await t.run(async (ctx) => ctx.db.get(productId));
    expect(productAfterAttach?.primaryImage).toBe(upload!.objectKey);

    const deleted = await t.mutation(internal.productMedia.deleteImage, {
      companyId,
      productId,
      imageId: upload!.imageId,
      deletedAt: createdAt + 2_000,
    });

    expect(deleted).toMatchObject({
      productId,
      imageId: upload!.imageId,
      objectKey: upload!.objectKey,
    });

    const cleanupJobs = await t.run(async (ctx) => ctx.db.query("mediaCleanupJobs").collect());
    const productAfterDelete = await t.run(async (ctx) => ctx.db.get(productId));

    expect(productAfterDelete?.primaryImage).toBeUndefined();
    expect(cleanupJobs).toHaveLength(1);
    expect(cleanupJobs[0]).toMatchObject({
      companyId,
      productId,
      objectKey: upload!.objectKey,
      reason: "product_image_deleted",
      status: "pending",
    });
  });

  it("rejects deleting an image that is not the current primary image", async () => {
    const t = convexTest(schema, modules);

    const { companyId, productId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", {
        name: "Tenant",
        ownerPhone: "966500000703",
      });
      const categoryId = await ctx.db.insert("categories", {
        companyId,
        nameEn: "Containers",
      });
      const productId = await ctx.db.insert("products", {
        companyId,
        categoryId,
        nameEn: "Burger Box",
        primaryImage: "companies/company-1/products/product-1/image-1.jpg",
      });

      await ctx.db.insert("productImageUploads", {
        companyId,
        productId,
        imageId: "image-2",
        objectKey: "companies/company-1/products/product-1/image-2.jpg",
        intendedContentType: "image/jpeg",
        maxSizeBytes: 5 * 1024 * 1024,
        status: "completed",
        createdAt: Date.UTC(2026, 2, 12, 0, 0, 0),
        expiresAt: Date.UTC(2026, 2, 12, 0, 15, 0),
        completedAt: Date.UTC(2026, 2, 12, 0, 1, 0),
      });

      return { companyId, productId };
    });

    await expect(t.mutation(internal.productMedia.deleteImage, {
      companyId,
      productId,
      imageId: "image-2",
      deletedAt: Date.UTC(2026, 2, 12, 0, 2, 0),
    })).rejects.toThrow("NOT_FOUND: Product image not found");
  });

  it("rejects deleting an image when the expected object key is stale", async () => {
    const t = convexTest(schema, modules);

    const { companyId, productId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", {
        name: "Tenant",
        ownerPhone: "966500000704",
      });
      const categoryId = await ctx.db.insert("categories", {
        companyId,
        nameEn: "Containers",
      });
      const productId = await ctx.db.insert("products", {
        companyId,
        categoryId,
        nameEn: "Burger Box",
        primaryImage: "companies/company-1/products/product-1/current.jpg",
      });

      await ctx.db.insert("productImageUploads", {
        companyId,
        productId,
        imageId: "image-1",
        objectKey: "companies/company-1/products/product-1/current.jpg",
        intendedContentType: "image/jpeg",
        maxSizeBytes: 5 * 1024 * 1024,
        status: "completed",
        createdAt: Date.UTC(2026, 2, 12, 0, 0, 0),
        expiresAt: Date.UTC(2026, 2, 12, 0, 15, 0),
        completedAt: Date.UTC(2026, 2, 12, 0, 1, 0),
      });

      return { companyId, productId };
    });

    await expect(t.mutation(internal.productMedia.deleteImage, {
      companyId,
      productId,
      imageId: "image-1",
      expectedObjectKey: "companies/company-1/products/product-1/stale.jpg",
      deletedAt: Date.UTC(2026, 2, 12, 0, 2, 0),
    })).rejects.toThrow("NOT_FOUND: Product image not found");

    const productAfterDeleteAttempt = await t.run(async (ctx) => ctx.db.get(productId));
    const cleanupJobs = await t.run(async (ctx) => ctx.db.query("mediaCleanupJobs").collect());

    expect(productAfterDeleteAttempt?.primaryImage).toBe("companies/company-1/products/product-1/current.jpg");
    expect(cleanupJobs).toHaveLength(0);
  });

  it("queues cleanup jobs for stored images when a product is deleted", async () => {
    const t = convexTest(schema, modules);

    const { companyId, productId, imageKey } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", {
        name: "Tenant",
        ownerPhone: "966500000702",
      });
      const categoryId = await ctx.db.insert("categories", {
        companyId,
        nameEn: "Containers",
      });
      const productId = await ctx.db.insert("products", {
        companyId,
        categoryId,
        nameEn: "Burger Box",
        primaryImage: "companies/company-1/products/product-1/image-1.jpg",
      });

      return {
        companyId,
        productId,
        imageKey: "companies/company-1/products/product-1/image-1.jpg",
      };
    });

    await t.mutation(internal.products.remove, {
      companyId,
      productId,
    });

    const cleanupJobs = await t.run(async (ctx) => ctx.db.query("mediaCleanupJobs").collect());
    expect(cleanupJobs).toHaveLength(1);
    expect(cleanupJobs[0]).toMatchObject({
      companyId,
      productId,
      objectKey: imageKey,
      reason: "product_deleted",
    });
  });
});



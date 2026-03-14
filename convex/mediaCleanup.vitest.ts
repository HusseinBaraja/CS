/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';
import { convexTest } from 'convex-test';
import { internal } from './_generated/api';
import schema from './schema';

const modules =
  typeof import.meta.glob === "function"
    ? import.meta.glob(["./**/*.ts", "!./**/*.vitest.ts", "!./vitest.config.ts"])
    : ({} as Record<string, () => Promise<any>>);

describe.skipIf(typeof import.meta.glob !== "function")("convex media cleanup", () => {
  it("expires abandoned upload sessions and enqueues object cleanup", async () => {
    const t = convexTest(schema, modules);

    const now = Date.UTC(2026, 2, 12, 0, 0, 0);
    const { uploadId, companyId, productId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", {
        name: "Tenant",
        ownerPhone: "966500000710",
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
      const uploadId = await ctx.db.insert("productImageUploads", {
        companyId,
        productId,
        imageId: "image-1",
        objectKey: "companies/company-1/products/product-1/image-1.jpg",
        intendedContentType: "image/jpeg",
        maxSizeBytes: 5 * 1024 * 1024,
        status: "pending",
        createdAt: now - 20 * 60 * 1000,
        expiresAt: now - 5 * 60 * 1000,
      });

      return { uploadId, companyId, productId };
    });

    const expiredIds = await t.mutation(internal.mediaCleanup.expirePendingUploadsBatch, {
      now,
      limit: 10,
    });

    expect(expiredIds).toEqual([uploadId]);

    const upload = await t.run(async (ctx) => ctx.db.get(uploadId));
    const cleanupJobs = await t.run(async (ctx) => ctx.db.query("mediaCleanupJobs").collect());

    expect(upload?.status).toBe("expired");
    expect(cleanupJobs).toHaveLength(1);
    expect(cleanupJobs[0]).toMatchObject({
      companyId,
      productId,
      imageId: "image-1",
      objectKey: "companies/company-1/products/product-1/image-1.jpg",
      reason: "expired_upload_session",
      status: "pending",
    });
  });

  it("tracks cleanup job claim, retry scheduling, and completion state", async () => {
    const t = convexTest(schema, modules);

    const now = Date.UTC(2026, 2, 12, 0, 0, 0);
    const { companyId, jobId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", {
        name: "Tenant",
        ownerPhone: "966500000711",
      });
      const jobId = await ctx.db.insert("mediaCleanupJobs", {
        companyId,
        objectKey: "companies/company-1/products/product-1/image-1.jpg",
        reason: "product_deleted",
        status: "pending",
        attempts: 0,
        nextAttemptAt: now,
        leaseExpiresAt: now,
        createdAt: now,
        updatedAt: now,
      });

      return { companyId, jobId };
    });

    const claimed = await t.mutation(internal.mediaCleanup.claimJob, {
      jobId,
      now,
    });

    expect(claimed).toMatchObject({
      companyId,
      status: "processing",
    });

    await t.mutation(internal.mediaCleanup.markJobRetry, {
      jobId,
      now: now + 1_000,
      nextAttemptAt: now + 30_000,
      lastError: "network timeout",
    });

    await expect(
      t.mutation(internal.mediaCleanup.claimJob, {
        jobId,
        now: now + 5_000,
      }),
    ).resolves.toBeNull();

    const dueRetryIds = await t.query(internal.mediaCleanup.listDueJobIds, {
      status: "retry",
      now: now + 30_000,
      limit: 10,
    });
    expect(dueRetryIds).toEqual([jobId]);

    await t.mutation(internal.mediaCleanup.markJobCompleted, {
      jobId,
      now: now + 31_000,
    });

    const job = await t.run(async (ctx) => ctx.db.get(jobId));
    expect(job).toMatchObject({
      status: "completed",
      attempts: 1,
    });
  });

  it("reclaims stale processing jobs after the lease expires", async () => {
    const t = convexTest(schema, modules);

    const now = Date.UTC(2026, 2, 12, 0, 0, 0);
    const uploadId = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", {
        name: "Tenant",
        ownerPhone: "966500000712",
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

      return ctx.db.insert("productImageUploads", {
        companyId,
        productId,
        imageId: "image-lease",
        objectKey: "companies/company-1/products/product-1/image-lease.jpg",
        intendedContentType: "image/jpeg",
        maxSizeBytes: 5 * 1024 * 1024,
        status: "pending",
        createdAt: now - 20 * 60 * 1000,
        expiresAt: now - 5 * 60 * 1000,
      });
    });

    await t.mutation(internal.mediaCleanup.expirePendingUploadsBatch, {
      now,
      limit: 10,
    });

    const [jobId] = await t.run(async (ctx) =>
      ctx.db.query("mediaCleanupJobs").collect().then((jobs) => jobs.map((job) => job._id)),
    );
    expect(jobId).toBeDefined();

    await t.mutation(internal.mediaCleanup.claimJob, {
      jobId: jobId!,
      now,
    });

    await expect(
      t.query(internal.mediaCleanup.listDueJobIds, {
        status: "processing",
        now: now + 4 * 60_000,
        limit: 10,
      }),
    ).resolves.toEqual([]);

    await expect(
      t.query(internal.mediaCleanup.listDueJobIds, {
        status: "processing",
        now: now + 5 * 60_000,
        limit: 10,
      }),
    ).resolves.toEqual([jobId]);

    const reclaimed = await t.mutation(internal.mediaCleanup.claimJob, {
      jobId: jobId!,
      now: now + 5 * 60_000,
    });
    expect(reclaimed).toMatchObject({
      _id: jobId,
      status: "processing",
      attempts: 0,
    });

    await t.mutation(internal.mediaCleanup.markJobCompleted, {
      jobId: jobId!,
      now: now + 5 * 60_000 + 1_000,
    });

    const upload = await t.run(async (ctx) => ctx.db.get(uploadId));
    const job = await t.run(async (ctx) => ctx.db.get(jobId!));
    expect(upload?.status).toBe("expired");
    expect(job).toMatchObject({
      status: "completed",
      attempts: 0,
    });
  });
});

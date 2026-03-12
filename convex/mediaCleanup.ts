import { v } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import { internalMutation, internalQuery, type MutationCtx } from './_generated/server';

const CLEANUP_JOB_RETRY_DELAYS_MS = [
  30_000,
  2 * 60_000,
  10 * 60_000,
  30 * 60_000,
] as const;

const PENDING_UPLOAD_STATUS = "pending" as const;
const RETRY_JOB_STATUS = "retry" as const;
const PROCESSING_JOB_STATUS = "processing" as const;
const COMPLETED_JOB_STATUS = "completed" as const;
const FAILED_JOB_STATUS = "failed" as const;
const EXPIRED_UPLOAD_STATUS = "expired" as const;

const takeDueUploadSessions = async (
  ctx: MutationCtx,
  now: number,
  limit: number,
): Promise<Array<Doc<"productImageUploads">>> =>
  ctx.db
    .query("productImageUploads")
    .withIndex("by_status_expires_at", (q) => q.eq("status", PENDING_UPLOAD_STATUS).lte("expiresAt", now))
    .take(limit);

export const enqueueCleanupJobInMutation = async (
  ctx: MutationCtx,
  args: {
    companyId: Id<"companies">;
    productId?: Id<"products">;
    imageId?: string;
    objectKey: string;
    reason: string;
    now?: number;
  },
): Promise<Id<"mediaCleanupJobs">> => {
  const now = args.now ?? Date.now();
  const jobId = await ctx.db.insert("mediaCleanupJobs", {
    companyId: args.companyId,
    ...(args.productId ? { productId: args.productId } : {}),
    ...(args.imageId ? { imageId: args.imageId } : {}),
    objectKey: args.objectKey,
    reason: args.reason,
    status: PENDING_UPLOAD_STATUS,
    attempts: 0,
    nextAttemptAt: now,
    createdAt: now,
    updatedAt: now,
  });

  return jobId;
};

export const claimJob = internalMutation({
  args: {
    jobId: v.id("mediaCleanupJobs"),
    now: v.number(),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) {
      return null;
    }

    if (
      (job.status !== PENDING_UPLOAD_STATUS && job.status !== RETRY_JOB_STATUS) ||
      job.nextAttemptAt > args.now
    ) {
      return null;
    }

    await ctx.db.patch(args.jobId, {
      status: PROCESSING_JOB_STATUS,
      updatedAt: args.now,
    });

    return {
      ...job,
      status: PROCESSING_JOB_STATUS,
    };
  },
});

export const markJobCompleted = internalMutation({
  args: {
    jobId: v.id("mediaCleanupJobs"),
    now: v.number(),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) {
      return null;
    }

    await ctx.db.patch(args.jobId, {
      status: COMPLETED_JOB_STATUS,
      updatedAt: args.now,
      lastError: undefined,
    });

    return {
      jobId: args.jobId,
      status: COMPLETED_JOB_STATUS,
    };
  },
});

export const markJobRetry = internalMutation({
  args: {
    jobId: v.id("mediaCleanupJobs"),
    now: v.number(),
    nextAttemptAt: v.number(),
    lastError: v.string(),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) {
      return null;
    }

    const attempts = job.attempts + 1;
    await ctx.db.patch(args.jobId, {
      status: RETRY_JOB_STATUS,
      attempts,
      nextAttemptAt: args.nextAttemptAt,
      lastError: args.lastError,
      updatedAt: args.now,
    });

    return {
      jobId: args.jobId,
      attempts,
      nextAttemptAt: args.nextAttemptAt,
    };
  },
});

export const markJobFailed = internalMutation({
  args: {
    jobId: v.id("mediaCleanupJobs"),
    now: v.number(),
    lastError: v.string(),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) {
      return null;
    }

    await ctx.db.patch(args.jobId, {
      status: FAILED_JOB_STATUS,
      attempts: job.attempts + 1,
      lastError: args.lastError,
      updatedAt: args.now,
    });

    return {
      jobId: args.jobId,
      status: FAILED_JOB_STATUS,
    };
  },
});

export const listDueJobIds = internalQuery({
  args: {
    status: v.union(v.literal(PENDING_UPLOAD_STATUS), v.literal(RETRY_JOB_STATUS)),
    now: v.number(),
    limit: v.number(),
  },
  handler: async (ctx, args) => {
    const jobs = await ctx.db
      .query("mediaCleanupJobs")
      .withIndex("by_status_next_attempt_at", (q) => q.eq("status", args.status).lte("nextAttemptAt", args.now))
      .take(args.limit);

    return jobs.map((job) => job._id);
  },
});

export const expirePendingUploadsBatch = internalMutation({
  args: {
    now: v.number(),
    limit: v.number(),
  },
  handler: async (ctx, args) => {
    const expiredUploads = await takeDueUploadSessions(ctx, args.now, args.limit);
    const expiredUploadIds: Array<Id<"productImageUploads">> = [];

    for (const upload of expiredUploads) {
      await ctx.db.patch(upload._id, {
        status: EXPIRED_UPLOAD_STATUS,
      });
      await enqueueCleanupJobInMutation(ctx, {
        companyId: upload.companyId,
        productId: upload.productId,
        imageId: upload.imageId,
        objectKey: upload.objectKey,
        reason: "expired_upload_session",
        now: args.now,
      });
      expiredUploadIds.push(upload._id);
    }

    return expiredUploadIds;
  },
});

export const getRetryDelayMs = (attempts: number): number | null =>
  CLEANUP_JOB_RETRY_DELAYS_MS[attempts] ?? null;

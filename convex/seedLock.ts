import type { Doc, Id } from './_generated/dataModel';
import { internalMutation, type MutationCtx } from './_generated/server';
import { v } from 'convex/values';
import type { LockAcquireResult, LockRenewResult } from './seedTypes';

const SEED_SAMPLE_DATA_LOCK_KEY = "seedSampleData";
const SEED_SAMPLE_DATA_LOCK_LEASE_MS = 2 * 60 * 1000;

export const SEED_SAMPLE_DATA_LOCK_POLL_MS = 250;
export const SEED_SAMPLE_DATA_LOCK_HEARTBEAT_MS = 25 * 1000;

const loadSeedLock = async (
  ctx: MutationCtx,
): Promise<Doc<"jobLocks"> | null> => {
  const locks = await ctx.db
    .query("jobLocks")
    .withIndex("by_key", (q) => q.eq("key", SEED_SAMPLE_DATA_LOCK_KEY))
    .collect();

  if (locks.length > 1) {
    throw new Error(`Expected at most one ${SEED_SAMPLE_DATA_LOCK_KEY} lock, found ${locks.length}`);
  }

  return locks[0] ?? null;
};

const extendLockExpiry = async (
  ctx: MutationCtx,
  lockId: Id<"jobLocks">,
  ownerToken: string,
  now: number,
): Promise<void> => {
  await ctx.db.patch(lockId, {
    ownerToken,
    acquiredAt: now,
    expiresAt: now + SEED_SAMPLE_DATA_LOCK_LEASE_MS,
  });
};

export const acquireSeedSampleDataLock = internalMutation({
  args: {
    now: v.number(),
    ownerToken: v.string(),
  },
  handler: async (ctx, args): Promise<LockAcquireResult> => {
    const existingLock = await loadSeedLock(ctx);

    if (!existingLock) {
      await ctx.db.insert("jobLocks", {
        key: SEED_SAMPLE_DATA_LOCK_KEY,
        ownerToken: args.ownerToken,
        acquiredAt: args.now,
        expiresAt: args.now + SEED_SAMPLE_DATA_LOCK_LEASE_MS,
      });

      return {
        acquired: true,
        waitMs: 0,
      };
    }

    if (existingLock.ownerToken === args.ownerToken || existingLock.expiresAt <= args.now) {
      await extendLockExpiry(ctx, existingLock._id, args.ownerToken, args.now);

      return {
        acquired: true,
        waitMs: 0,
      };
    }

    return {
      acquired: false,
      waitMs: Math.max(existingLock.expiresAt - args.now, SEED_SAMPLE_DATA_LOCK_POLL_MS),
    };
  },
});

export const renewSeedSampleDataLock = internalMutation({
  args: {
    now: v.number(),
    ownerToken: v.string(),
  },
  handler: async (ctx, args): Promise<LockRenewResult> => {
    const existingLock = await loadSeedLock(ctx);

    if (!existingLock || existingLock.ownerToken !== args.ownerToken) {
      return {
        renewed: false,
      };
    }

    await extendLockExpiry(ctx, existingLock._id, args.ownerToken, args.now);

    return {
      renewed: true,
    };
  },
});

export const releaseSeedSampleDataLock = internalMutation({
  args: {
    ownerToken: v.string(),
  },
  handler: async (ctx, args): Promise<void> => {
    const existingLock = await loadSeedLock(ctx);
    if (!existingLock || existingLock.ownerToken !== args.ownerToken) {
      return;
    }

    await ctx.db.delete(existingLock._id);
  },
});

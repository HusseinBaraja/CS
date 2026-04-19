import { v } from 'convex/values';
import type { Doc, Id } from '../_generated/dataModel';
import { internal } from '../_generated/api';
import type { ActionCtx, MutationCtx } from '../_generated/server';
import {
  CONVERSATION_LOCK_LEASE_MS,
  CONVERSATION_LOCK_POLL_MS,
  MAX_CONVERSATION_LOCK_WAIT_MS,
} from './constants';
import { normalizePhoneNumber, normalizeTimestamp } from './message-helpers';
import type { LockAcquireResult } from './types';

const sleep = (delayMs: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });

const getConversationLockKey = (companyId: Id<'companies'>, phoneNumber: string): string =>
  `conversation:${companyId}:${phoneNumber}`;

const loadConversationLock = async (
  ctx: MutationCtx,
  key: string,
): Promise<Doc<'jobLocks'> | null> => {
  const locks = await ctx.db
    .query('jobLocks')
    .withIndex('by_key', (q) => q.eq('key', key))
    .collect();

  if (locks.length > 1) {
    throw new Error(`Expected at most one ${key} lock, found ${locks.length}`);
  }

  return locks[0] ?? null;
};

const extendConversationLock = async (
  ctx: MutationCtx,
  lockId: Id<'jobLocks'>,
  ownerToken: string,
  now: number,
): Promise<void> => {
  await ctx.db.patch(lockId, {
    ownerToken,
    acquiredAt: now,
    expiresAt: now + CONVERSATION_LOCK_LEASE_MS,
  });
};

export const withConversationLock = async <T>(
  ctx: ActionCtx,
  input: {
    companyId: Id<'companies'>;
    phoneNumber: string;
    now?: number;
  },
  work: () => Promise<T>,
): Promise<T> => {
  const phoneNumber = normalizePhoneNumber(input.phoneNumber);
  const ownerToken = crypto.randomUUID();
  const key = getConversationLockKey(input.companyId, phoneNumber);
  const startedAt = normalizeTimestamp(input.now, Date.now());
  const deadline = startedAt + MAX_CONVERSATION_LOCK_WAIT_MS;
  let currentNow = startedAt;

  for (;;) {
    const acquisitionNow =
      input.now === undefined ? normalizeTimestamp(undefined, Date.now()) : currentNow;
    const acquisition = await ctx.runMutation(internal.conversations.acquireConversationLock, {
      key,
      now: acquisitionNow,
      ownerToken,
    });

    if (acquisition.acquired) {
      break;
    }

    const sleepMs = Math.min(acquisition.waitMs, CONVERSATION_LOCK_POLL_MS);
    const deadlineNow =
      input.now === undefined ? normalizeTimestamp(undefined, Date.now()) : currentNow;
    if (deadlineNow + sleepMs > deadline) {
      throw new Error(
        `Timeout acquiring conversation lock for companyId=${input.companyId} phoneNumber=${phoneNumber}`,
      );
    }

    if (input.now !== undefined) {
      currentNow += sleepMs;
    }
    await sleep(sleepMs);
  }

  try {
    return await work();
  } finally {
    await ctx.runMutation(internal.conversations.releaseConversationLock, {
      key,
      ownerToken,
    });
  }
};

export const acquireConversationLockDefinition = {
  args: {
    key: v.string(),
    now: v.number(),
    ownerToken: v.string(),
  },
  handler: async (ctx: MutationCtx, args: { key: string; now: number; ownerToken: string }): Promise<LockAcquireResult> => {
    const existingLock = await loadConversationLock(ctx, args.key);
    if (!existingLock) {
      await ctx.db.insert('jobLocks', {
        key: args.key,
        ownerToken: args.ownerToken,
        acquiredAt: args.now,
        expiresAt: args.now + CONVERSATION_LOCK_LEASE_MS,
      });

      return {
        acquired: true,
        waitMs: 0,
      };
    }

    if (existingLock.ownerToken === args.ownerToken || existingLock.expiresAt <= args.now) {
      await extendConversationLock(ctx, existingLock._id, args.ownerToken, args.now);
      return {
        acquired: true,
        waitMs: 0,
      };
    }

    return {
      acquired: false,
      waitMs: Math.max(existingLock.expiresAt - args.now, CONVERSATION_LOCK_POLL_MS),
    };
  },
};

export const releaseConversationLockDefinition = {
  args: {
    key: v.string(),
    ownerToken: v.string(),
  },
  handler: async (ctx: MutationCtx, args: { key: string; ownerToken: string }): Promise<void> => {
    const existingLock = await loadConversationLock(ctx, args.key);
    if (!existingLock || existingLock.ownerToken !== args.ownerToken) {
      return;
    }

    await ctx.db.delete(existingLock._id);
  },
};

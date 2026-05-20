/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { internal } from './_generated/api';
import schema from './schema';
import { createCompany, createDeletedCompany } from './testFixtures';

const modules =
  typeof import.meta.glob === 'function'
    ? import.meta.glob(['./**/*.ts', '!./**/*.vitest.ts', '!./vitest.config.ts'])
    : ({} as Record<string, () => Promise<any>>);

describe.skipIf(typeof import.meta.glob !== 'function')('convex companySettings', () => {
  it('returns null when companyId does not refer to an existing company', async () => {
    const t = convexTest(schema, modules);
    const companyId = await t.run(async (ctx) =>
      createDeletedCompany(ctx).then(({ companyId }) => companyId),
    );

    const settings = await t.query(internal.companySettings.get, { companyId });
    const upserted = await t.mutation(internal.companySettings.upsert, {
      companyId,
      missingPricePolicy: 'handoff',
    });

    expect(settings).toBeNull();
    expect(upserted).toBeNull();
  });

  it('returns default settings when a company has no settings row', async () => {
    const t = convexTest(schema, modules);
    const companyId = await t.run(async (ctx) =>
      createCompany(ctx).then(({ companyId }) => companyId),
    );

    const settings = await t.query(internal.companySettings.get, { companyId });

    expect(settings).toEqual({
      id: null,
      companyId,
      missingPricePolicy: 'reply_unavailable',
    });
  });

  it('reads one canonical row when duplicate settings rows exist', async () => {
    const t = convexTest(schema, modules);
    const companyId = await t.run(async (ctx) =>
      createCompany(ctx).then(({ companyId }) => companyId),
    );
    const firstSettingsId = await t.run(async (ctx) =>
      ctx.db.insert('companySettings', {
        companyId,
        missingPricePolicy: 'handoff',
      }),
    );
    await t.run(async (ctx) =>
      ctx.db.insert('companySettings', {
        companyId,
        missingPricePolicy: 'reply_unavailable',
      }),
    );

    const settings = await t.query(internal.companySettings.get, { companyId });

    expect(settings).toEqual({
      id: firstSettingsId,
      companyId,
      missingPricePolicy: 'handoff',
    });
  });

  it('collapses duplicate settings rows during upsert', async () => {
    const t = convexTest(schema, modules);
    const companyId = await t.run(async (ctx) =>
      createCompany(ctx).then(({ companyId }) => companyId),
    );
    const firstSettingsId = await t.run(async (ctx) =>
      ctx.db.insert('companySettings', {
        companyId,
        missingPricePolicy: 'reply_unavailable',
      }),
    );
    await t.run(async (ctx) =>
      ctx.db.insert('companySettings', {
        companyId,
        missingPricePolicy: 'handoff',
      }),
    );

    const settings = await t.mutation(internal.companySettings.upsert, {
      companyId,
      missingPricePolicy: 'handoff',
    });
    const rows = await t.run(async (ctx) =>
      ctx.db
        .query('companySettings')
        .withIndex('by_company', (q) => q.eq('companyId', companyId))
        .collect(),
    );

    expect(settings).toEqual({
      id: firstSettingsId,
      companyId,
      missingPricePolicy: 'handoff',
    });
    expect(rows).toEqual([
      expect.objectContaining({
        _id: firstSettingsId,
        companyId,
        missingPricePolicy: 'handoff',
      }),
    ]);
  });

  it('inserts settings when a company has no settings row during upsert', async () => {
    const t = convexTest(schema, modules);
    const companyId = await t.run(async (ctx) =>
      createCompany(ctx).then(({ companyId }) => companyId),
    );

    const settings = await t.mutation(internal.companySettings.upsert, {
      companyId,
      missingPricePolicy: 'handoff',
    });
    const rows = await t.run(async (ctx) =>
      ctx.db
        .query('companySettings')
        .withIndex('by_company', (q) => q.eq('companyId', companyId))
        .collect(),
    );

    expect(settings).toEqual({
      id: expect.any(String),
      companyId,
      missingPricePolicy: 'handoff',
    });
    expect(settings?.id).not.toHaveLength(0);
    expect(rows).toEqual([
      expect.objectContaining({
        _id: settings?.id,
        companyId,
        missingPricePolicy: 'handoff',
      }),
    ]);
  });

  it('serializes upsert with a company settings lock and releases it', async () => {
    const t = convexTest(schema, modules);
    const companyId = await t.run(async (ctx) =>
      createCompany(ctx).then(({ companyId }) => companyId),
    );

    await t.mutation(internal.companySettings.upsert, {
      companyId,
      missingPricePolicy: 'handoff',
    });

    const locks = await t.run(async (ctx) =>
      ctx.db
        .query('jobLocks')
        .withIndex('by_key', (q) => q.eq('key', `companySettings:${companyId}`))
        .collect(),
    );

    expect(locks).toEqual([]);
  });

  it('rejects upsert while a company settings lock is active', async () => {
    const t = convexTest(schema, modules);
    const companyId = await t.run(async (ctx) =>
      createCompany(ctx).then(({ companyId }) => companyId),
    );
    await t.run(async (ctx) =>
      ctx.db.insert('jobLocks', {
        key: `companySettings:${companyId}`,
        ownerToken: 'existing-owner',
        acquiredAt: Date.now(),
        expiresAt: Date.now() + 15_000,
      }),
    );

    await expect(
      t.mutation(internal.companySettings.upsert, {
        companyId,
        missingPricePolicy: 'handoff',
      }),
    ).rejects.toThrow(`Company settings upsert already in progress for companyId=${companyId}`);
  });
});

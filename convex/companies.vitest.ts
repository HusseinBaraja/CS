/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { CLEANUP_BATCH_SIZE, type CleanupBatchResult, type CleanupCursor } from './companyCleanup';
import schema from './schema';

const modules =
  typeof import.meta.glob === "function"
    ? import.meta.glob(["./**/*.ts", "!./**/*.vitest.ts", "!./vitest.config.ts"])
    : ({} as Record<string, () => Promise<any>>);

const collectCounts = async (t: ReturnType<typeof convexTest>) =>
  t.run(async (ctx) => {
    const companies = await ctx.db.query("companies").collect();
    const categories = await ctx.db.query("categories").collect();
    const products = await ctx.db.query("products").collect();
    const productImageUploads = await ctx.db.query("productImageUploads").collect();
    const mediaCleanupJobs = await ctx.db.query("mediaCleanupJobs").collect();
    const botRuntimeSessions = await ctx.db.query("botRuntimeSessions").collect();
    const botRuntimePairingArtifacts = await ctx.db.query("botRuntimePairingArtifacts").collect();
    const productVariants = await ctx.db.query("productVariants").collect();
    const offers = await ctx.db.query("offers").collect();
    const currencyRates = await ctx.db.query("currencyRates").collect();
    const conversations = await ctx.db.query("conversations").collect();
    const messages = await ctx.db.query("messages").collect();
    const analyticsEvents = await ctx.db.query("analyticsEvents").collect();
    const embeddings = await ctx.db.query("embeddings").collect();

    return {
      analyticsEvents,
      botRuntimePairingArtifacts,
      categories,
      botRuntimeSessions,
      companies,
      conversations,
      currencyRates,
      embeddings,
      messages,
      offers,
      products,
      productImageUploads,
      productVariants,
      mediaCleanupJobs,
    };
  });

const createTenantFixture = async (
  t: ReturnType<typeof convexTest>,
  options: {
    messageCount?: number;
    analyticsEventCount?: number;
    embeddingCount?: number;
    variantCount?: number;
    productCount?: number;
    conversationCount?: number;
  } = {},
) =>
  t.run(async (ctx) => {
    const messageCount = options.messageCount ?? 1;
    const analyticsEventCount = options.analyticsEventCount ?? 1;
    const embeddingCount = options.embeddingCount ?? 1;
    const variantCount = options.variantCount ?? 1;
    const productCount = options.productCount ?? 1;
    const conversationCount = options.conversationCount ?? 1;

    const companyId = await ctx.db.insert("companies", {
      name: "Cascade Tenant",
      ownerPhone: "966500000700",
      timezone: "Asia/Aden",
      config: {
        welcomesEnabled: true,
      },
    });

    const categoryId = await ctx.db.insert("categories", {
      companyId,
      nameEn: "Containers",
    });

    const productIds: Array<Id<"products">> = [];

    for (let index = 0; index < productCount; index += 1) {
      const productId = await ctx.db.insert("products", {
        companyId,
        categoryId,
        nameEn: `Burger Box ${index}`,
      });
      productIds.push(productId);
    }

    for (let index = 0; index < variantCount; index += 1) {
      await ctx.db.insert("productVariants", {
        productId: productIds[index % productIds.length]!,
        variantLabel: `Variant ${index}`,
        attributes: {
          size: index,
        },
      });
    }

    const conversationIds: Array<Id<"conversations">> = [];

    for (let index = 0; index < conversationCount; index += 1) {
      const conversationId = await ctx.db.insert("conversations", {
        companyId,
        phoneNumber: `9677000000${String(index + 1).padStart(2, "0")}`,
        muted: false,
      });
      conversationIds.push(conversationId);
    }

    for (let index = 0; index < messageCount; index += 1) {
      await ctx.db.insert("messages", {
        conversationId: conversationIds[index % conversationIds.length]!,
        role: "user",
        content: `Message ${index}`,
        timestamp: index,
      });
    }

    await ctx.db.insert("offers", {
      companyId,
      contentEn: "Offer",
      active: true,
    });

    await ctx.db.insert("currencyRates", {
      companyId,
      fromCurrency: "SAR",
      toCurrency: "YER",
      rate: 425,
    });

    for (let index = 0; index < analyticsEventCount; index += 1) {
      await ctx.db.insert("analyticsEvents", {
        companyId,
        eventType: "company_delete_test",
        timestamp: index,
        payload: {
          index,
        },
      });
    }

    const embedding = Array.from({ length: 768 }, () => 0.25);
    for (let index = 0; index < embeddingCount; index += 1) {
      await ctx.db.insert("embeddings", {
        companyId,
        productId: productIds[index % productIds.length]!,
        embedding,
        textContent: `Embedding ${index}`,
        language: "en",
        companyLanguage: `${companyId}:en`,
      });
    }

    await ctx.db.insert("productImageUploads", {
      companyId,
      productId: productIds[0]!,
      imageId: "upload-image-1",
      objectKey: `companies/${companyId}/products/${productIds[0]!}/upload-image-1.jpg`,
      intendedContentType: "image/jpeg",
      maxSizeBytes: 5 * 1024 * 1024,
      status: "pending",
      createdAt: Date.UTC(2026, 2, 12, 0, 0, 0),
      expiresAt: Date.UTC(2026, 2, 12, 0, 15, 0),
    });

    await ctx.db.insert("mediaCleanupJobs", {
      companyId,
      productId: productIds[0]!,
      imageId: "cleanup-image-1",
      objectKey: `companies/${companyId}/products/${productIds[0]!}/cleanup-image-1.jpg`,
      reason: "tenant_cleanup_test",
      status: "pending",
      attempts: 0,
      nextAttemptAt: Date.UTC(2026, 2, 12, 0, 0, 0),
      leaseExpiresAt: Date.UTC(2026, 2, 12, 0, 0, 0),
      createdAt: Date.UTC(2026, 2, 12, 0, 0, 0),
      updatedAt: Date.UTC(2026, 2, 12, 0, 0, 0),
    });

    await ctx.db.insert("botRuntimeSessions", {
      companyId,
      runtimeOwnerId: "runtime-owner-1",
      sessionKey: `company-${companyId}`,
      state: "open",
      attempt: 0,
      hasQr: false,
      updatedAt: Date.UTC(2026, 2, 12, 0, 0, 0),
      leaseExpiresAt: Date.UTC(2026, 2, 12, 0, 1, 0),
    });

    await ctx.db.insert("botRuntimePairingArtifacts", {
      companyId,
      runtimeOwnerId: "runtime-owner-1",
      sessionKey: `company-${companyId}`,
      qrText: "pairing-qr",
      updatedAt: Date.UTC(2026, 2, 12, 0, 0, 0),
      expiresAt: Date.UTC(2026, 2, 12, 0, 1, 0),
    });

    return {
      companyId,
    };
  });

describe.skipIf(typeof import.meta.glob !== "function")("convex companies", () => {
  it("lists sanitized companies sorted by name and id", async () => {
    const t = convexTest(schema, modules);

    await t.run(async (ctx) => {
      await ctx.db.insert("companies", {
        name: "Zulu Packaging",
        ownerPhone: "966500000999",
        seedKey: "seed-hidden",
      });
      await ctx.db.insert("companies", {
        name: "Alpha Packaging",
        ownerPhone: "966500000111",
        timezone: "Asia/Aden",
      });
      await ctx.db.insert("companies", {
        name: "Alpha Packaging",
        ownerPhone: "966500000222",
      });
    });

    const companies = await t.query(internal.companies.list, {});

    expect(companies).toHaveLength(3);
    expect(companies.map((company: { name: string }) => company.name)).toEqual([
      "Alpha Packaging",
      "Alpha Packaging",
      "Zulu Packaging",
    ]);
    expect(companies.every((company: object) => !("_id" in company))).toBe(true);
    expect(companies.every((company: object) => !("_creationTime" in company))).toBe(true);
    expect(companies.every((company: object) => !("seedKey" in company))).toBe(true);
  });

  it("gets a single sanitized company", async () => {
    const t = convexTest(schema, modules);

    const companyId = await t.run(async (ctx) =>
      ctx.db.insert("companies", {
        name: "Tenant",
        ownerPhone: "966500000010",
        timezone: "Asia/Aden",
        config: {
          welcomesEnabled: true,
        },
        seedKey: "hidden-seed",
      }),
    );

    const company = await t.query(internal.companies.get, {
      companyId,
    });

    expect(company).toEqual({
      id: companyId,
      name: "Tenant",
      ownerPhone: "966500000010",
      timezone: "Asia/Aden",
      config: {
        welcomesEnabled: true,
      },
    });
  });

  it("creates a company and trims required fields", async () => {
    const t = convexTest(schema, modules);

    const company = await t.mutation(internal.companies.create, {
      name: "  Tenant  ",
      ownerPhone: " 966500000020 ",
      timezone: "Asia/Aden",
      config: {
        welcomesEnabled: true,
      },
    });

    expect(company).toMatchObject({
      name: "Tenant",
      ownerPhone: "966500000020",
      timezone: "Asia/Aden",
      config: {
        welcomesEnabled: true,
      },
    });
  });

  it("updates a company partially and clears nullable fields", async () => {
    const t = convexTest(schema, modules);

    const companyId = await t.run(async (ctx) =>
      ctx.db.insert("companies", {
        name: "Tenant",
        ownerPhone: "966500000030",
        timezone: "Asia/Aden",
        config: {
          welcomesEnabled: true,
        },
      }),
    );

    const updatedCompany = await t.mutation(internal.companies.update, {
      companyId,
      name: "  Renamed Tenant  ",
      timezone: null,
      config: null,
    });

    expect(updatedCompany).toEqual({
      id: companyId,
      name: "Renamed Tenant",
      ownerPhone: "966500000030",
    });
  });

  it("rejects duplicate owner phones on create and update", async () => {
    const t = convexTest(schema, modules);

    const companyId = await t.run(async (ctx) =>
      ctx.db.insert("companies", {
        name: "Existing Tenant",
        ownerPhone: "966500000040",
      }),
    );

    await expect(
      t.mutation(internal.companies.create, {
        name: "New Tenant",
        ownerPhone: "966500000040",
      }),
    ).rejects.toThrow("CONFLICT: Owner phone is already assigned to another company");

    const secondCompanyId = await t.run(async (ctx) =>
      ctx.db.insert("companies", {
        name: "Second Tenant",
        ownerPhone: "966500000041",
      }),
    );

    await expect(
      t.mutation(internal.companies.update, {
        companyId: secondCompanyId,
        ownerPhone: "966500000040",
      }),
    ).rejects.toThrow("CONFLICT: Owner phone is already assigned to another company");

    expect(companyId).toBeDefined();
  });

  it("cascades tenant deletion across all related tables", async () => {
    const t = convexTest(schema, modules);
    const { companyId } = await createTenantFixture(t, {
      messageCount: 2,
      analyticsEventCount: 3,
      embeddingCount: 4,
      variantCount: 2,
    });

    const result = await t.action(internal.companies.remove, {
      companyId,
    });
    const counts = await collectCounts(t);

    expect(result).toEqual({
      companyId,
      counts: {
        companies: 1,
        categories: 1,
        botRuntimePairingArtifacts: 1,
        botRuntimeSessions: 1,
        products: 1,
        productImageUploads: 1,
        productVariants: 2,
        embeddings: 4,
        conversations: 1,
        messages: 2,
        mediaCleanupJobs: 1,
        offers: 1,
        currencyRates: 1,
        analyticsEvents: 3,
      },
    });
    expect(counts.companies).toHaveLength(0);
    expect(counts.categories).toHaveLength(0);
    expect(counts.botRuntimePairingArtifacts).toHaveLength(0);
    expect(counts.botRuntimeSessions).toHaveLength(0);
    expect(counts.products).toHaveLength(0);
    expect(counts.productImageUploads).toHaveLength(0);
    expect(counts.productVariants).toHaveLength(0);
    expect(counts.embeddings).toHaveLength(0);
    expect(counts.conversations).toHaveLength(0);
    expect(counts.messages).toHaveLength(0);
    expect(counts.mediaCleanupJobs).toHaveLength(0);
    expect(counts.offers).toHaveLength(0);
    expect(counts.currencyRates).toHaveLength(0);
    expect(counts.analyticsEvents).toHaveLength(0);
  });

  it("deletes oversized tenants over multiple cleanup batches", async () => {
    const t = convexTest(schema, modules);
    const oversizedBatchCount = 70;
    const { companyId } = await createTenantFixture(t, {
      messageCount: oversizedBatchCount,
      analyticsEventCount: oversizedBatchCount,
      embeddingCount: oversizedBatchCount,
      variantCount: oversizedBatchCount,
      productCount: 3,
      conversationCount: 3,
    });

    const result = await t.action(internal.companies.remove, {
      companyId,
    });
    const counts = await collectCounts(t);

    expect(result?.counts).toEqual({
      companies: 1,
      categories: 1,
      botRuntimePairingArtifacts: 1,
      botRuntimeSessions: 1,
      products: 3,
      productImageUploads: 1,
      productVariants: oversizedBatchCount,
      embeddings: oversizedBatchCount,
      conversations: 3,
      messages: oversizedBatchCount,
      mediaCleanupJobs: 1,
      offers: 1,
      currencyRates: 1,
      analyticsEvents: oversizedBatchCount,
    });
    expect(counts.companies).toHaveLength(0);
    expect(counts.categories).toHaveLength(0);
    expect(counts.botRuntimePairingArtifacts).toHaveLength(0);
    expect(counts.botRuntimeSessions).toHaveLength(0);
    expect(counts.products).toHaveLength(0);
    expect(counts.productImageUploads).toHaveLength(0);
    expect(counts.productVariants).toHaveLength(0);
    expect(counts.embeddings).toHaveLength(0);
    expect(counts.conversations).toHaveLength(0);
    expect(counts.messages).toHaveLength(0);
    expect(counts.mediaCleanupJobs).toHaveLength(0);
    expect(counts.offers).toHaveLength(0);
    expect(counts.currencyRates).toHaveLength(0);
    expect(counts.analyticsEvents).toHaveLength(0);
  });

  it("resumes cleanup cursors across variant and message batches without rescanning parent records", async () => {
    const t = convexTest(schema, modules);
    const oversizedBatchCount = 70;
    const { companyId } = await createTenantFixture(t, {
      messageCount: oversizedBatchCount,
      analyticsEventCount: 0,
      embeddingCount: 0,
      variantCount: oversizedBatchCount,
      productCount: 3,
      conversationCount: 3,
    });

    const firstVariantBatch = await t.mutation(internal.companyCleanup.clearCompanyDataBatch, {
      companyId,
    });
    const secondVariantBatch = await t.mutation(internal.companyCleanup.clearCompanyDataBatch, {
      companyId,
      cursor: firstVariantBatch.nextCursor ?? undefined,
    });

    expect(firstVariantBatch.stage).toBe("productVariants");
    expect(firstVariantBatch.deletedCount).toBe(CLEANUP_BATCH_SIZE);
    expect(firstVariantBatch.done).toBe(false);
    expect(firstVariantBatch.nextCursor).toMatchObject({
      stage: "productVariants",
    });
    expect(secondVariantBatch.stage).toBe("productVariants");
    expect(secondVariantBatch.deletedCount).toBe(oversizedBatchCount - CLEANUP_BATCH_SIZE);
    expect(secondVariantBatch.nextCursor).toBeNull();

    const firstMessageBatch = await t.mutation(internal.companyCleanup.clearCompanyDataBatch, {
      companyId,
    });
    const secondMessageBatch = await t.mutation(internal.companyCleanup.clearCompanyDataBatch, {
      companyId,
      cursor: firstMessageBatch.nextCursor ?? undefined,
    });

    expect(firstMessageBatch.stage).toBe("messages");
    expect(firstMessageBatch.deletedCount).toBe(CLEANUP_BATCH_SIZE);
    expect(firstMessageBatch.done).toBe(false);
    expect(firstMessageBatch.nextCursor).toMatchObject({
      stage: "messages",
    });
    expect(secondMessageBatch.stage).toBe("messages");
    expect(secondMessageBatch.deletedCount).toBe(oversizedBatchCount - CLEANUP_BATCH_SIZE);
    expect(secondMessageBatch.nextCursor).toBeNull();
  });

  it("completes cleanup across both child batch stages without paginated query errors", async () => {
    const t = convexTest(schema, modules);
    const oversizedBatchCount = 70;
    const { companyId } = await createTenantFixture(t, {
      messageCount: oversizedBatchCount,
      analyticsEventCount: 2,
      embeddingCount: 2,
      variantCount: oversizedBatchCount,
      productCount: 3,
      conversationCount: 3,
    });

    const stageSequence: string[] = [];
    let cursor: CleanupCursor | null = null;

    for (;;) {
      const result: CleanupBatchResult = await t.mutation(internal.companyCleanup.clearCompanyDataBatch, {
        companyId,
        ...(cursor ? { cursor } : {}),
      });

      stageSequence.push(result.stage);
      cursor = result.nextCursor;

      if (result.done) {
        break;
      }
    }

    const counts = await collectCounts(t);

    expect(stageSequence).toContain("productVariants");
    expect(stageSequence).toContain("messages");
    expect(stageSequence.at(-1)).toBe("companies");
    expect(counts.companies).toHaveLength(0);
    expect(counts.categories).toHaveLength(0);
    expect(counts.products).toHaveLength(0);
    expect(counts.productVariants).toHaveLength(0);
    expect(counts.conversations).toHaveLength(0);
    expect(counts.messages).toHaveLength(0);
    expect(counts.embeddings).toHaveLength(0);
    expect(counts.analyticsEvents).toHaveLength(0);
  });

  it("can clear tenant-scoped data while preserving the company row", async () => {
    const t = convexTest(schema, modules);
    const { companyId } = await createTenantFixture(t, {
      messageCount: 2,
      analyticsEventCount: 3,
      embeddingCount: 4,
      variantCount: 2,
    });

    const stageSequence: string[] = [];
    let cursor: CleanupCursor | null = null;

    for (;;) {
      const result: CleanupBatchResult = await t.mutation(internal.companyCleanup.clearCompanyDataBatch, {
        companyId,
        deleteCompany: false,
        ...(cursor ? { cursor } : {}),
      });

      stageSequence.push(result.stage);
      cursor = result.nextCursor;

      if (result.done) {
        break;
      }
    }

    const counts = await collectCounts(t);

    expect(stageSequence).not.toContain("companies");
    expect(stageSequence.at(-1)).toBe("done");
    expect(counts.companies).toHaveLength(1);
    expect(counts.companies[0]?._id).toBe(companyId);
    expect(counts.categories).toHaveLength(0);
    expect(counts.botRuntimePairingArtifacts).toHaveLength(0);
    expect(counts.botRuntimeSessions).toHaveLength(0);
    expect(counts.products).toHaveLength(0);
    expect(counts.productImageUploads).toHaveLength(0);
    expect(counts.productVariants).toHaveLength(0);
    expect(counts.embeddings).toHaveLength(0);
    expect(counts.conversations).toHaveLength(0);
    expect(counts.messages).toHaveLength(0);
    expect(counts.mediaCleanupJobs).toHaveLength(0);
    expect(counts.offers).toHaveLength(0);
    expect(counts.currencyRates).toHaveLength(0);
    expect(counts.analyticsEvents).toHaveLength(0);
  });

  it("completes child cleanup batches when a single parent spans multiple pages", async () => {
    const t = convexTest(schema, modules);
    const oversizedBatchCount = 70;
    const fixture = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", {
        name: "Cursor Tenant",
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
      const conversationId = await ctx.db.insert("conversations", {
        companyId,
        phoneNumber: "967700000099",
        muted: false,
      });

      for (let index = 0; index < oversizedBatchCount; index += 1) {
        await ctx.db.insert("productVariants", {
          productId,
          variantLabel: `Variant ${index}`,
          attributes: {
            size: index,
          },
        });
        await ctx.db.insert("messages", {
          conversationId,
          role: "user",
          content: `Message ${index}`,
          timestamp: index,
        });
      }

      return {
        companyId,
      };
    });

    const firstVariantBatch = await t.mutation(internal.companyCleanup.clearCompanyDataBatch, {
      companyId: fixture.companyId,
    });
    const secondVariantBatch = await t.mutation(internal.companyCleanup.clearCompanyDataBatch, {
      companyId: fixture.companyId,
      cursor: firstVariantBatch.nextCursor ?? undefined,
    });
    const remainingVariants = await t.run(async (ctx) => ctx.db.query("productVariants").collect());

    expect(firstVariantBatch.stage).toBe("productVariants");
    expect(firstVariantBatch.deletedCount).toBe(CLEANUP_BATCH_SIZE);
    expect(secondVariantBatch.stage).toBe("productVariants");
    expect(secondVariantBatch.deletedCount).toBe(oversizedBatchCount - CLEANUP_BATCH_SIZE);
    expect(remainingVariants).toHaveLength(0);

    const firstMessageBatch = await t.mutation(internal.companyCleanup.clearCompanyDataBatch, {
      companyId: fixture.companyId,
    });
    const secondMessageBatch = await t.mutation(internal.companyCleanup.clearCompanyDataBatch, {
      companyId: fixture.companyId,
      cursor: firstMessageBatch.nextCursor ?? undefined,
    });
    const remainingMessages = await t.run(async (ctx) => ctx.db.query("messages").collect());

    expect(firstMessageBatch.stage).toBe("messages");
    expect(firstMessageBatch.deletedCount).toBe(CLEANUP_BATCH_SIZE);
    expect(secondMessageBatch.stage).toBe("messages");
    expect(secondMessageBatch.deletedCount).toBe(oversizedBatchCount - CLEANUP_BATCH_SIZE);
    expect(remainingMessages).toHaveLength(0);
  });

  it("continues product variant cleanup when a batch exactly exhausts one product and more products remain", async () => {
    const t = convexTest(schema, modules);
    const fixture = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", {
        name: "Variant Cursor Tenant",
        ownerPhone: "966500000702",
      });
      const categoryId = await ctx.db.insert("categories", {
        companyId,
        nameEn: "Containers",
      });
      const firstProductId = await ctx.db.insert("products", {
        companyId,
        categoryId,
        nameEn: "Burger Box",
      });
      const secondProductId = await ctx.db.insert("products", {
        companyId,
        categoryId,
        nameEn: "Soup Cup",
      });

      for (let index = 0; index < CLEANUP_BATCH_SIZE; index += 1) {
        await ctx.db.insert("productVariants", {
          productId: firstProductId,
          variantLabel: `Variant ${index}`,
          attributes: {
            size: index,
          },
        });
      }

      const trailingVariantId = await ctx.db.insert("productVariants", {
        productId: secondProductId,
        variantLabel: "Trailing Variant",
        attributes: {
          size: CLEANUP_BATCH_SIZE,
        },
      });

      return {
        companyId,
        trailingVariantId,
      };
    });

    const firstVariantBatch = await t.mutation(internal.companyCleanup.clearCompanyDataBatch, {
      companyId: fixture.companyId,
    });
    const secondVariantBatch = await t.mutation(internal.companyCleanup.clearCompanyDataBatch, {
      companyId: fixture.companyId,
      cursor: firstVariantBatch.nextCursor ?? undefined,
    });
    const remainingVariants = await t.run(async (ctx) =>
      ctx.db.query("productVariants").collect(),
    );

    expect(firstVariantBatch.stage).toBe("productVariants");
    expect(firstVariantBatch.deletedCount).toBe(CLEANUP_BATCH_SIZE);
    expect(firstVariantBatch.nextCursor).toMatchObject({
      stage: "productVariants",
    });
    expect(secondVariantBatch.stage).toBe("productVariants");
    expect(secondVariantBatch.deletedCount).toBe(1);
    expect(remainingVariants).toHaveLength(0);
    expect(fixture.trailingVariantId).toBeDefined();
  });

  it("continues message cleanup when a batch exactly exhausts one conversation and more conversations remain", async () => {
    const t = convexTest(schema, modules);
    const fixture = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", {
        name: "Message Cursor Tenant",
        ownerPhone: "966500000703",
      });
      const firstConversationId = await ctx.db.insert("conversations", {
        companyId,
        phoneNumber: "967700000100",
        muted: false,
      });
      const secondConversationId = await ctx.db.insert("conversations", {
        companyId,
        phoneNumber: "967700000101",
        muted: false,
      });

      for (let index = 0; index < CLEANUP_BATCH_SIZE; index += 1) {
        await ctx.db.insert("messages", {
          conversationId: firstConversationId,
          role: "user",
          content: `Message ${index}`,
          timestamp: index,
        });
      }

      const trailingMessageId = await ctx.db.insert("messages", {
        conversationId: secondConversationId,
        role: "user",
        content: "Trailing message",
        timestamp: CLEANUP_BATCH_SIZE,
      });

      return {
        companyId,
        trailingMessageId,
      };
    });

    const firstMessageBatch = await t.mutation(internal.companyCleanup.clearCompanyDataBatch, {
      companyId: fixture.companyId,
    });
    const secondMessageBatch = await t.mutation(internal.companyCleanup.clearCompanyDataBatch, {
      companyId: fixture.companyId,
      cursor: firstMessageBatch.nextCursor ?? undefined,
    });
    const remainingMessages = await t.run(async (ctx) =>
      ctx.db.query("messages").collect(),
    );

    expect(firstMessageBatch.stage).toBe("messages");
    expect(firstMessageBatch.deletedCount).toBe(CLEANUP_BATCH_SIZE);
    expect(firstMessageBatch.nextCursor).toMatchObject({
      stage: "messages",
    });
    expect(secondMessageBatch.stage).toBe("messages");
    expect(secondMessageBatch.deletedCount).toBe(1);
    expect(remainingMessages).toHaveLength(0);
    expect(fixture.trailingMessageId).toBeDefined();
  });
});

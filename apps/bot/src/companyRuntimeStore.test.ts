import { describe, expect, test } from 'bun:test';
import { createConvexCompanyRuntimeStore, normalizeCompanyRuntimeStoreError } from './companyRuntimeStore';

type StubConvexAdminClient = {
  query: (reference: unknown, args: unknown) => Promise<unknown>;
  mutation: (reference: unknown, args: unknown) => Promise<unknown>;
  action: (reference: unknown, args: unknown) => Promise<unknown>;
};

const createStore = (client: StubConvexAdminClient) =>
  createConvexCompanyRuntimeStore({
    createClient: () => client as never,
  });

describe("createConvexCompanyRuntimeStore", () => {
  test("rejects blank company ids before issuing convex mutations", async () => {
    let mutationCalled = false;
    const store = createStore({
      query: async () => [],
      mutation: async () => {
        mutationCalled = true;
        return undefined;
      },
      action: async () => undefined,
    });

    await expect(store.clearPairingArtifact("   ", "runtime-owner-1")).rejects.toThrow("Invalid companyId");
    await expect(store.clearSession("   ", "runtime-owner-1")).rejects.toThrow("Invalid companyId");
    await expect(store.upsertSession({
      companyId: "   ",
      runtimeOwnerId: "runtime-owner-1",
      sessionKey: "company-Y29tcGFueS0x",
      state: "open",
      attempt: 0,
      hasQr: false,
      updatedAt: 1_000,
      leaseExpiresAt: 61_000,
    })).rejects.toThrow("Invalid companyId");

    expect(mutationCalled).toBe(false);
  });

  test("forwards per-company runtime session cleanup to convex with a normalized company id", async () => {
    const mutationCalls: Array<{ reference: unknown; args: unknown }> = [];
    const store = createStore({
      query: async () => [],
      mutation: async (reference, args) => {
        mutationCalls.push({ reference, args });
        return undefined;
      },
      action: async () => undefined,
    });

    await store.clearSession(" company-123 ", "runtime-owner-1");

    expect(mutationCalls).toHaveLength(1);
    expect(mutationCalls[0]?.args).toEqual({
      companyId: "company-123",
      runtimeOwnerId: "runtime-owner-1",
    });
  });

  test("normalizes missing company runtime function errors into an actionable sync message", async () => {
    const store = createStore({
      query: async () => {
        throw new Error(
          "[Request ID: abc] Server Error\nCould not find public function for 'companyRuntime:listEnabledBotCompanies'. Did you forget to run `npx convex dev` or `npx convex deploy`?",
        );
      },
      mutation: async () => undefined,
      action: async () => undefined,
    });

    await expect(store.listEnabledCompanies()).rejects.toThrow(
      "Configured Convex deployment is missing bot runtime backend functions. Sync the backend with `bunx convex dev --once` for the active CONVEX_DEPLOYMENT.",
    );
  });

  test("leaves unrelated convex errors unchanged", () => {
    const error = new Error("network timeout");

    expect(normalizeCompanyRuntimeStoreError(error)).toBe(error);
  });
});

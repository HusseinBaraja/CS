import { describe, expect, test } from 'bun:test';
import { createConvexCompanyRuntimeStore } from './companyRuntimeStore';

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

    await expect(store.clearPairingArtifact("   ")).rejects.toThrow("Invalid companyId");
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
});

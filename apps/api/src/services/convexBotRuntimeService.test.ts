import { describe, expect, test } from 'bun:test';
import { convexInternal } from '@cs/db';
import { getFunctionName } from 'convex/server';
import { createConvexBotRuntimeService } from './convexBotRuntimeService';
import { createDatabaseServiceError } from './botRuntime';

type StubConvexAdminClient = {
  query: (reference: unknown, args: unknown) => Promise<unknown>;
  mutation: (reference: unknown, args: unknown) => Promise<unknown>;
  action: (reference: unknown, args: unknown) => Promise<unknown>;
};

const createService = (client: StubConvexAdminClient, now: () => number = () => 1_000) =>
  createConvexBotRuntimeService({
    createClient: () => client as never,
    now,
  });

describe("createConvexBotRuntimeService", () => {
  test("uses the internal bot runtime operator snapshot query with the current time", async () => {
    let receivedReference: unknown;
    let receivedArgs: unknown;
    const service = createService({
      query: async (reference, args) => {
        receivedReference = reference;
        receivedArgs = args;
        return [];
      },
      mutation: async () => {
        throw new Error("mutation should not be called");
      },
      action: async () => {
        throw new Error("action should not be called");
      },
    }, () => 42_000);

    await expect(service.listOperatorSnapshots()).resolves.toEqual([]);
    expect(getFunctionName(receivedReference as never)).toBe(
      getFunctionName(convexInternal.companyRuntime.listBotRuntimeOperatorSnapshots),
    );
    expect(receivedArgs).toEqual({ now: 42_000 });
  });

  test("maps unknown errors to a database unavailable service error", async () => {
    const service = createService({
      query: async () => {
        throw new Error("socket hang up");
      },
      mutation: async () => {
        throw new Error("mutation should not be called");
      },
      action: async () => {
        throw new Error("action should not be called");
      },
    });

    await expect(service.listOperatorSnapshots()).rejects.toEqual(
      createDatabaseServiceError("Bot runtime data is temporarily unavailable"),
    );
  });
});

import assert from "node:assert/strict";
import test, { mock } from "node:test";

type MockModule = (
  specifier: string,
  options: { namedExports: Record<string, unknown> },
) => void;

const mockModule = (mock as unknown as { module: MockModule }).module.bind(
  mock,
);
const sessionUserId = "session-user";
const otherUserId = "other-user";

let balanceServiceInput: unknown;
let grantServiceInput: unknown;
let recordsServiceInput: unknown;

mockModule(new URL("../services/get-balance.ts", import.meta.url).href, {
  namedExports: {
    getBalance: async (input: unknown) => {
      balanceServiceInput = input;
      return {
        totalSummary: { total: 0, used: 0, frozen: 0, available: 0 },
        accounts: [],
      };
    },
  },
});

mockModule(new URL("../services/get-records.ts", import.meta.url).href, {
  namedExports: {
    getRecords: async (input: unknown) => {
      recordsServiceInput = input;
      return { records: [], total: 0, hasMore: false };
    },
  },
});

mockModule(new URL("../services/grant.ts", import.meta.url).href, {
  namedExports: {
    grant: async (input: unknown) => {
      grantServiceInput = input;
      return {
        accountId: "account-id",
        wallet: "default",
        source: "default",
        totalAmount: 10,
        addedAmount: 10,
        recordId: "record-id",
        isIdempotentReplay: false,
      };
    },
  },
});

mockModule(new URL("../services/post-consume.ts", import.meta.url).href, {
  namedExports: {
    postConsume: async () => ({
      totalAmount: 0,
      consumeDetails: [],
      consumedAt: new Date(0).toISOString(),
    }),
  },
});

const { billingRouter } = await import("./index");
const { createTRPCRouter } = await import("@/server/api/trpc");
const { grantCredits } = await import("../../admin/routers/procedures/credits");
const adminCreditsRouter = createTRPCRouter({ grantCredits });

function createContext(isAdmin = false) {
  const context = {
    headers: new Headers(),
    clientIp: "127.0.0.1",
    session: { user: { id: sessionUserId } },
    db: {
      user: {
        findUnique: async () => ({
          id: sessionUserId,
          isAdmin,
          isBlocked: false,
          isPrimaryDeviceAccount: true,
        }),
      },
    },
  } as unknown as Parameters<typeof billingRouter.createCaller>[0];

  return context;
}

function createOrdinaryCaller() {
  return billingRouter.createCaller(createContext());
}

void test("ordinary authenticated callers cannot invoke privileged billing mutations", () => {
  const exposedProcedures = new Set(Object.keys(billingRouter._def.procedures));

  for (const procedure of [
    "grant",
    "freeze",
    "consume",
    "unfreeze",
    "postConsume",
  ]) {
    assert.equal(
      exposedProcedures.has(procedure),
      false,
      `billing.${procedure} must not be exposed through tRPC`,
    );
  }
});

void test("getBalance uses the session user when another userId is supplied", async () => {
  const caller = createOrdinaryCaller();

  await caller.getBalance({ userId: otherUserId } as unknown as Parameters<
    typeof caller.getBalance
  >[0]);

  assert.deepEqual(balanceServiceInput, { userId: sessionUserId });
});

void test("getRecords uses the session user when another userId is supplied", async () => {
  const caller = createOrdinaryCaller();

  await caller.getRecords({
    userId: otherUserId,
    limit: 5,
  } as unknown as Parameters<typeof caller.getRecords>[0]);

  assert.deepEqual(recordsServiceInput, {
    userId: sessionUserId,
    limit: 5,
  });
});

void test("ordinary callers cannot use the existing admin credit grant route", async () => {
  const caller = adminCreditsRouter.createCaller(createContext());

  await assert.rejects(
    caller.grantCredits({ userId: otherUserId, amount: 10 }),
    (error: unknown) => {
      assert.equal((error as { code?: unknown }).code, "FORBIDDEN");
      return true;
    },
  );
  assert.equal(grantServiceInput, undefined);
});

void test("administrators can still grant credits through the admin route", async () => {
  const caller = adminCreditsRouter.createCaller(createContext(true));

  const result = await caller.grantCredits({
    userId: otherUserId,
    amount: 10,
    reason: "Support adjustment",
  });

  assert.deepEqual(result, { success: true });
  assert.deepEqual(grantServiceInput, {
    userId: otherUserId,
    source: "default",
    amount: 10,
    outerBizId: (grantServiceInput as { outerBizId: string }).outerBizId,
    businessType: "ADMIN_GRANT",
    description: "Support adjustment",
  });
  assert.match(
    (grantServiceInput as { outerBizId: string }).outerBizId,
    /^admin_grant_other-user_\d+$/,
  );
});

// deno-lint-ignore-file no-explicit-any
import { assertEquals } from "jsr:@std/assert";
import { handleTransaction } from "./transaction.ts";
import { Context } from "jsr:@hono/hono";
import { eImunisasiSupabaseAdmin } from "../../_shared/eimunisasiSupabase.ts";
import { paymentSupabaseAdmin } from "../../_shared/paymentSupabase.ts";
import { stub } from "jsr:@std/testing/mock";

Deno.test("handleTransaction - should return 401 when no authorization header", async () => {
  const mockContext = {
    req: {
      header: () => undefined,
      param: () => "tx123",
    },
    json: (data: unknown, status?: number) =>
      new Response(JSON.stringify(data), { status }),
  } as unknown as Context;

  const res = await handleTransaction(mockContext);
  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(body.is_successful, false);
  assertEquals(body.message, "Unauthorized");
});

Deno.test("handleTransaction - should return 401 when getUser fails", async () => {
  const userStub = stub(
    eImunisasiSupabaseAdmin.auth,
    "getUser",
    () => Promise.resolve({ data: null, error: { message: "fail" } } as any),
  );
  const mockContext = {
    req: {
      header: () => "Bearer tok",
      param: () => "tx123",
    },
    json: (data: any, status?: number) => ({ data, status }),
  } as unknown as Context;

  try {
    const res: any = await handleTransaction(mockContext);
    assertEquals(res.status, 401);
    const body = res.data;
    assertEquals(body.is_successful, false);
    assertEquals(body.message, "Unauthorized");
  } finally {
    userStub.restore();
  }
});

Deno.test("handleTransaction - should return 200 when transaction found", async () => {
  const mockUser = { user: { id: "u1" } };
  const userStub = stub(
    eImunisasiSupabaseAdmin.auth,
    "getUser",
    () => Promise.resolve({ data: mockUser, error: null } as any),
  );

  const mockTransaction = {
    transaction_id: "tx123",
    payment: { order_id: "o1" },
    info: "data",
  };
  const txQuery: any = {
    select: () => ({
      eq: () => ({
        single: () => Promise.resolve({ data: mockTransaction, error: null }),
      }),
    }),
  };
  const orderCountQuery: any = {
    select: () => ({
      eq: () => ({ eq: () => Promise.resolve({ count: 1, error: null }) }),
    }),
  };
  const fromStub = stub(
    paymentSupabaseAdmin,
    "from",
    (table: string) => {
      if (table === "transactions") return txQuery;
      if (table === "orders") return orderCountQuery;
      return {} as any;
    },
  );

  const mockContext = {
    req: {
      header: () => "Bearer tok",
      param: () => "tx123",
    },
    json: (data: any, status?: number) => ({ data, status }),
  } as unknown as Context;

  try {
    const res: any = await handleTransaction(mockContext);
    assertEquals(res.status, 200);
    const body = res.data;
    assertEquals(body.is_successful, true);
    assertEquals(body.message, "Transaction found");
    assertEquals(body.data, mockTransaction);
  } finally {
    userStub.restore();
    fromStub.restore();
  }
});

Deno.test("handleTransaction - should throw error when transaction not found", async () => {
  const mockUser = { user: { id: "u1" } };
  const userStub = stub(
    eImunisasiSupabaseAdmin.auth,
    "getUser",
    () => Promise.resolve({ data: mockUser, error: null } as any),
  );

  const txQuery: any = {
    select: () => ({
      eq: () => ({
        single: () => Promise.resolve({ data: null, error: null }),
      }),
    }),
  };
  const orderCountQuery: any = {
    select: () => ({
      eq: () => ({ eq: () => Promise.resolve({ count: 0, error: null }) }),
    }),
  };
  const fromStub = stub(
    paymentSupabaseAdmin,
    "from",
    (table: string) => {
      if (table === "transactions") return txQuery;
      if (table === "orders") return orderCountQuery;
      return {} as any;
    },
  );

  const mockContext = {
    req: {
      header: () => "Bearer tok",
      param: () => "tx123",
    },
    json: (_data: any, _status?: number) => new Response(),
  } as unknown as Context;

  try {
    await handleTransaction(mockContext);
    throw new Error("Expected handleTransaction to throw");
  } catch (err: any) {
    assertEquals(err.code, "PGRST116");
    assertEquals(err.message, "Transaction not found");
  } finally {
    userStub.restore();
    fromStub.restore();
  }
});

Deno.test("handleTransaction - should throw error when order count fetch error occurs", async () => {
  const mockUser = { user: { id: "u1" } };
  const userStub = stub(
    eImunisasiSupabaseAdmin.auth,
    "getUser",
    () => Promise.resolve({ data: mockUser, error: null } as any),
  );
  const txQuery: any = {
    select: () => ({
      eq: () => ({
        single: () =>
          Promise.resolve({
            data: { transaction_id: "tx123", payment: { order_id: "o1" } },
            error: null,
          }),
      }),
    }),
  };
  const orderCountQuery: any = {
    select: () => ({
      eq: () => ({
        eq: () =>
          Promise.resolve({ count: 0, error: { message: "db count error" } }),
      }),
    }),
  };
  const fromStub = stub(
    paymentSupabaseAdmin,
    "from",
    (table: string) => {
      if (table === "transactions") return txQuery;
      if (table === "orders") return orderCountQuery;
      return {} as any;
    },
  );
  const mockContext = {
    req: { header: () => "Bearer tok", param: () => "tx123" },
    json: (_data: any, _status?: number) => new Response(),
  } as unknown as Context;
  try {
    await handleTransaction(mockContext);
    throw new Error("Expected handleTransaction to throw");
  } catch (err: any) {
    assertEquals(err.message, "Error fetching order count");
  } finally {
    userStub.restore();
    fromStub.restore();
  }
});

Deno.test("handleTransaction - should return 500 when transaction query error not PGRST116", async () => {
  const mockUser = { user: { id: "u1" } };
  const userStub = stub(
    eImunisasiSupabaseAdmin.auth,
    "getUser",
    () => Promise.resolve({ data: mockUser, error: null } as any),
  );
  const txQuery: any = {
    select: () => ({
      eq: () => ({
        single: () =>
          Promise.resolve({
            data: null,
            error: { code: "SOME_ERR", message: "db error" },
          }),
      }),
    }),
  };
  const orderCountQuery: any = {
    select: () => ({
      eq: () => ({ eq: () => Promise.resolve({ count: 1, error: null }) }),
    }),
  };
  const fromStub = stub(
    paymentSupabaseAdmin,
    "from",
    (table: string) => {
      if (table === "transactions") return txQuery;
      if (table === "orders") return orderCountQuery;
      return {} as any;
    },
  );
  const mockContext = {
    req: { header: () => "Bearer tok", param: () => "tx123" },
    json: (data: any, status?: number) => ({ data, status }),
  } as unknown as Context;
  try {
    const res: any = await handleTransaction(mockContext);
    assertEquals(res.status, 500);
    assertEquals(res.data.is_successful, false);
    assertEquals(
      res.data.message,
      "Sorry, we are unable to process this request at this time. Please try again later.",
    );
  } finally {
    userStub.restore();
    fromStub.restore();
  }
});

Deno.test("handleTransaction - should return 404 when transaction query error code PGRST116", async () => {
  const mockUser = { user: { id: "u1" } };
  const userStub = stub(
    eImunisasiSupabaseAdmin.auth,
    "getUser",
    () => Promise.resolve({ data: mockUser, error: null } as any),
  );
  const txQuery: any = {
    select: () => ({
      eq: () => ({
        single: () =>
          Promise.resolve({
            data: null,
            error: { code: "PGRST116", message: "txn not found" },
          }),
      }),
    }),
  };
  const orderCountQuery: any = {
    select: () => ({
      eq: () => ({ eq: () => Promise.resolve({ count: 1, error: null }) }),
    }),
  };
  const fromStub = stub(
    paymentSupabaseAdmin,
    "from",
    (table: string) => {
      if (table === "transactions") return txQuery;
      if (table === "orders") return orderCountQuery;
      return {} as any;
    },
  );
  const mockContext = {
    req: { header: () => "Bearer tok", param: () => "tx123" },
    json: (data: any, status?: number) => ({ data, status }),
  } as unknown as Context;
  try {
    const res: any = await handleTransaction(mockContext);
    assertEquals(res.status, 404);
    assertEquals(res.data.is_successful, false);
    assertEquals(res.data.message, "Transaction not found");
  } finally {
    userStub.restore();
    fromStub.restore();
  }
});

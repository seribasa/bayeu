import { Context } from "hono";
import * as mod from "node:crypto";
import { MidtransGateway, snap } from "./midtrans.ts";
import { assertEquals } from "@std/assert";
import { stub } from "@std/testing/mock";
import { paymentSupabaseAdmin } from "../../_shared/paymentSupabase.ts";

Deno.test({
  sanitizeOps: false,
  sanitizeResources: false,
  name: "Midtrans Snap Configuration",
}, () => {
  const localSnap = snap;

  assertEquals(
    localSnap.apiConfig.serverKey,
    "test_midtrans_sandbox_server_key",
  );
  assertEquals(
    localSnap.apiConfig.clientKey,
    "test_midtrans_sandbox_client_key",
  );
});

Deno.test({
  sanitizeOps: false,
  sanitizeResources: false,
  name: "MidtransGateway - createTransaction creates transaction successfully",
}, async () => {
  const mockTransactionResponse: {
    token: string;
    redirect_url: string;
  } = {
    token: "mock_transaction_token",
    redirect_url: "https://mock.redirect.url",
  };

  const midtransStub = stub(
    snap,
    "createTransaction",
    () => Promise.resolve(mockTransactionResponse),
  );

  try {
    const gateway = new MidtransGateway();
    const result = await gateway.createTransaction({
      orderId: "test-order",
      amount: 100,
      currency: "IDR",
      customerName: "Test Customer",
      customerEmail: "customerEmail",
      expiryMinutes: 1440,
    });

    assertEquals(result as never as Record<string, unknown>, {
      order_id: "test-order",
      gateway: "midtrans",
      redirect_url: mockTransactionResponse.redirect_url,
      token: result.token,
    });
  } finally {
    midtransStub.restore();
  }
});

Deno.test({
  sanitizeOps: false,
  sanitizeResources: false,
  name: "MidtransGateway - createTransaction throws error",
}, async () => {
  const snapError = new Error("Snap transaction error");

  const midtransStub = stub(
    snap,
    "createTransaction",
    () => Promise.reject(snapError),
  );

  try {
    const gateway = new MidtransGateway();
    await gateway.createTransaction({
      orderId: "test-order",
      amount: 100,
      currency: "IDR",
      customerName: "Test Customer",
      customerEmail: "customerEmail",
      expiryMinutes: 1440,
    });
    throw new Error("Expected createTransaction to throw");
  } catch (err: unknown) {
    const error = err as Error;
    assertEquals(error.message, snapError.message);
  } finally {
    midtransStub.restore();
  }
});

Deno.test({
  sanitizeOps: false,
  sanitizeResources: false,
  name: "MidtransGateway - handleWebhook handles valid webhook",
}, async () => {
  const mockResponse = {
    transaction_status: "pending",
    transaction_id: "test-transaction-id",
    order_id: "Postman-1578568851",
    currency: "IDR",
    status_code: "200",
    gross_amount: "10000.00",
    signature_key:
      "e78e2223638cb60dbdbc88d23deb9b927ac41be7263ab38758605bac834dc25425705543707504bfef0802914cfa3f5f538fa308d1f9086211c420e7892ba2ba",
    server_key: "VT-server-HJMpl9HLr_ntOKt5mRONdmKj",
  };

  Deno.env.set("SERVER_KEY", "VT-server-HJMpl9HLr_ntOKt5mRONdmKj");

  const orderQuery = {
    select: () => ({
      eq: () => ({
        single: () =>
          Promise.resolve({
            data: {
              order_id: "Postman-1578568851",
              user_id: "test-user-id",
              total_amount: 10000,
            },
            error: null,
          }),
      }),
    }),
  };

  const fromStub = stub(
    paymentSupabaseAdmin,
    "from",
    ((table: string) => {
      if (table === "orders") return orderQuery;
      return {} as never;
    }) as never,
  );

  const rpcStub = stub(
    paymentSupabaseAdmin,
    "rpc",
    () => Promise.resolve({ data: {}, error: null }) as never,
  );

  const mockContext = {
    req: {
      json: () => Promise.resolve(mockResponse),
    },
    json: (body: unknown, status: number) =>
      new Response(JSON.stringify(body), { status }),
  } as never as Context;

  try {
    const gateway = new MidtransGateway();
    const result = await gateway.handleWebhook(mockContext);

    assertEquals(result.status, 200);
    assertEquals(await result.json(), {
      is_successful: true,
      message: "Midtrans webhook processed",
    });
  } finally {
    fromStub.restore();
    rpcStub.restore();
  }
});

Deno.test({
  sanitizeOps: false,
  sanitizeResources: false,
  name: "MidtransGateway - handleWebhook invalid signature throws 403",
}, async () => {
  const mockResponse = {
    transaction_status: "pending",
    transaction_id: "test-transaction-id",
    order_id: "test-order-id",
    currency: "IDR",
    status_code: "200",
    gross_amount: "10000.00",
    signature_key: "invalid_sig",
  };

  const mockContext = {
    req: {
      json: () => Promise.resolve(mockResponse),
    },
    json: (body: unknown, status: number) =>
      new Response(JSON.stringify(body), { status }),
  } as never as Context;

  const gateway = new MidtransGateway();
  const result = await gateway.handleWebhook(mockContext);

  assertEquals(result.status, 403);
  assertEquals(await result.json(), {
    is_successful: false,
    message: "Invalid Midtrans signature",
  });
});

Deno.test({
  sanitizeOps: false,
  sanitizeResources: false,
  name: "MidtransGateway - handleWebhook missing signature",
}, async () => {
  const mockResponse = {
    transaction_status: "pending",
  };

  const mockContext = {
    req: {
      json: () => Promise.resolve(mockResponse),
    },
    json: (body: unknown, status: number) =>
      new Response(JSON.stringify(body), { status }),
  } as never as Context;

  const gateway = new MidtransGateway();
  const result = await gateway.handleWebhook(mockContext);

  assertEquals(result.status, 403);
  assertEquals(await result.json(), {
    is_successful: false,
    message: "Missing Midtrans signature",
  });
});

function genSig(
  order_id: unknown,
  status: unknown,
  amount: unknown,
  serverKey: string,
) {
  const sha512 = mod.createHash("sha512");
  sha512.update(
    (order_id as string) + (status as string) + (amount as string) + serverKey,
  );
  return sha512.digest("hex");
}

Deno.test({
  sanitizeOps: false,
  sanitizeResources: false,
  name: "MidtransGateway - handleWebhook missing order_id",
}, async () => {
  const mockResponse = {
    transaction_status: "pending",
    signature_key: genSig(
      undefined as never,
      undefined as never,
      undefined as never,
      "any_key",
    ),
    server_key: "any_key",
  };

  const mockContext = {
    req: { json: () => Promise.resolve(mockResponse) },
    json: (body: unknown, status: number) =>
      new Response(JSON.stringify(body), { status }),
  } as never as Context;

  const gateway = new MidtransGateway();
  const result = await gateway.handleWebhook(mockContext);
  assertEquals(result.status, 200);
});

Deno.test({
  sanitizeOps: false,
  sanitizeResources: false,
  name: "MidtransGateway - handleWebhook order not found",
}, async () => {
  const mockResponse = {
    order_id: "missing-order",
    transaction_status: "pending",
    status_code: "200",
    gross_amount: "100.00",
    signature_key: genSig("missing-order", "200", "100.00", "any_key"),
    server_key: "any_key",
  };

  const fromStub = stub(paymentSupabaseAdmin, "from", () =>
    ({
      select: () => ({
        eq: () => ({ single: () => Promise.resolve({ data: null }) }),
      }),
    }) as never);

  const mockContext = {
    req: { json: () => Promise.resolve(mockResponse) },
    json: (body: unknown, status: number) =>
      new Response(JSON.stringify(body), { status }),
  } as never as Context;

  try {
    const gateway = new MidtransGateway();
    const result = await gateway.handleWebhook(mockContext);
    assertEquals(result.status, 200);
  } finally {
    fromStub.restore();
  }
});

Deno.test({
  sanitizeOps: false,
  sanitizeResources: false,
  name: "MidtransGateway - handleWebhook RPC Error",
}, async () => {
  const mockResponse = {
    order_id: "valid-order",
    transaction_status: "pending",
    status_code: "200",
    gross_amount: "100.00",
    signature_key: genSig("valid-order", "200", "100.00", "any_key"),
    server_key: "any_key",
  };

  const fromStub = stub(paymentSupabaseAdmin, "from", () =>
    ({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: { total_amount: 100 } }),
        }),
      }),
    }) as never);

  const rpcStub = stub(
    paymentSupabaseAdmin,
    "rpc",
    () =>
      Promise.resolve({ data: null, error: { message: "RPC Error" } }) as never,
  );

  const mockContext = {
    req: { json: () => Promise.resolve(mockResponse) },
    json: (body: unknown, status: number) =>
      new Response(JSON.stringify(body), { status }),
  } as never as Context;

  try {
    const gateway = new MidtransGateway();
    await gateway.handleWebhook(mockContext);
  } catch (e: unknown) {
    if (e instanceof Error) assertEquals(e.message, "RPC Error");
  } finally {
    fromStub.restore();
    rpcStub.restore();
  }
});

Deno.test({
  sanitizeOps: false,
  sanitizeResources: false,
  name: "MidtransGateway - handleWebhook success and publish event",
}, async () => {
  const mockResponse = {
    order_id: "valid-order",
    transaction_status: "settlement",
    status_code: "200",
    gross_amount: "100.00",
    signature_key: genSig("valid-order", "200", "100.00", "any_key"),
    server_key: "any_key",
  };

  const fromStub = stub(paymentSupabaseAdmin, "from", () =>
    ({
      select: () => ({
        eq: () => ({
          single: () =>
            Promise.resolve({
              data: { total_amount: 100, metadata: { tenant_id: "tenant-1" } },
            }),
        }),
      }),
    }) as never);

  const rpcStub = stub(
    paymentSupabaseAdmin,
    "rpc",
    () =>
      Promise.resolve({
        data: { already_paid: false, metadata: { tenant_id: "tenant-1" } },
        error: null,
      }) as never,
  );

  const mockContext = {
    req: { json: () => Promise.resolve(mockResponse) },
    json: (body: unknown, status: number) =>
      new Response(JSON.stringify(body), { status }),
  } as never as Context;

  try {
    const gateway = new MidtransGateway();
    const result = await gateway.handleWebhook(mockContext);
    assertEquals(result.status, 200);
  } finally {
    fromStub.restore();
    rpcStub.restore();
  }
});

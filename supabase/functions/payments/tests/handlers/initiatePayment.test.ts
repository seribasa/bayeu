// deno-lint-ignore-file no-explicit-any
import { paymentGateways } from "../../gateways/paymentFactory.ts";
import { assertEquals } from "@std/assert";
import { paymentController } from "../../src/di/container.ts";
import { Context } from "hono";
import { stub } from "@std/testing/mock";
import { paymentSupabaseAdmin } from "../../../_shared/paymentSupabase.ts";

function createMockToken(sub: string = "user_123"): string {
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = btoa(
    JSON.stringify({
      sub,
      email: "test@example.com",
      user_metadata: { full_name: "Test User" },
    }),
  );
  return `${header}.${payload}.signature`;
}

Deno.test("handleInitiatePayment - returns 401 if missing auth header", async () => {
  const req = new Request("http://localhost/initiate-payment", {
    method: "POST",
  });
  const c = {
    req: {
      header: (key: string) => req.headers.get(key),
      json: () => Promise.resolve({}),
    },
    json: (body: any, status: number) => ({ body, status }),
  } as unknown as Context;

  const res = await handleInitiatePayment(c);
  assertEquals((res as any).status, 401);
  assertEquals((res as any).body.message, "Missing authorization header");
});

Deno.test("handleInitiatePayment - returns 400 if missing required fields", async () => {
  const token = createMockToken();
  const req = new Request("http://localhost/initiate-payment", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });

  const c = {
    req: {
      header: (key: string) => req.headers.get(key),
      json: () => Promise.resolve({ gateway: "stripe" }), // Missing amount and tenant_id
    },
    json: (body: any, status: number) => ({ body, status }),
  } as unknown as Context;

  const res = await handleInitiatePayment(c);
  assertEquals((res as any).status, 400);
  assertEquals((res as any).body.message, "Amount is required");
});

Deno.test("handleInitiatePayment - reuses active unexpired token", async () => {
  const token = createMockToken("user_123");
  const req = new Request("http://localhost/initiate-payment", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });

  const mockExistingOrder = {
    order_id: "ord-existing-123",
    gateway: "midtrans",
    created_at: new Date().toISOString(), // recent, unexpired
    gateway_response: {
      token: "snap-existing-token",
      redirect_url:
        "https://app.midtrans.com/snap/v2/vtweb/snap-existing-token",
    },
    metadata: {
      tenant_id: "kuala-api",
      invoice_id: "inv-999",
    },
  };

  const selectStub = stub(paymentSupabaseAdmin, "from", (table: string) => {
    if (table === "tenants") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () =>
              Promise.resolve({
                data: {
                  default_success_url: "https://kuala.peltops.com/success",
                  default_failed_url: "https://kuala.peltops.com/failed",
                  default_cancel_url: "https://kuala.peltops.com/cancel",
                  webhook_url: "http://kuala-api:8080/webhook",
                },
                error: null,
              }),
          }),
        }),
      } as any;
    }
    if (table === "orders") {
      return {
        select: () => {
          const query: any = {};
          query.eq = () => query;
          query.then = (resolve: any) =>
            resolve({ data: [mockExistingOrder], error: null });
          return query;
        },
      } as any;
    }
    return {} as any;
  });

  const c = {
    req: {
      header: (key: string) => req.headers.get(key),
      json: () =>
        Promise.resolve({
          gateway: "midtrans",
          amount: 100,
          tenant_id: "kuala-api",
          metadata: { invoice_id: "inv-999" },
        }),
    },
    json: (body: any, status?: number) => ({ body, status: status || 200 }),
  } as unknown as Context;

  const fetchStub = stub(
    globalThis,
    "fetch",
    () => Promise.resolve(new Response(JSON.stringify([]), { status: 200 })),
  );

  try {
    const res = await handleInitiatePayment(c);
    assertEquals((res as any).status, 200);
    assertEquals((res as any).body.is_successful, true);
    assertEquals((res as any).body.data.order_id, "ord-existing-123");
    assertEquals((res as any).body.data.token, "snap-existing-token");
  } finally {
    fetchStub.restore();
    selectStub.restore();
  }
});

Deno.test("handleInitiatePayment - successfully creates new payment", async () => {
  const token = createMockToken("user_123");
  const req = new Request("http://localhost/initiate-payment", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });

  const selectStub = stub(paymentSupabaseAdmin, "from", (table: string) => {
    if (table === "tenants") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () =>
              Promise.resolve({
                data: {
                  default_success_url: "https://kuala.peltops.com/success",
                  default_failed_url: "https://kuala.peltops.com/failed",
                  default_cancel_url: "https://kuala.peltops.com/cancel",
                  webhook_url: "http://kuala-api:8080/webhook",
                },
                error: null,
              }),
          }),
        }),
      } as any;
    }
    if (table === "orders") {
      return {
        select: () => {
          const query: any = {};
          query.eq = () => query;
          // Return empty existing orders
          query.then = (resolve: any) => resolve({ data: [], error: null });
          return query;
        },
        insert: () => ({
          select: () => ({
            single: () =>
              Promise.resolve({
                data: {
                  order_id: "new-order-123",
                  gateway_response: { token: "new-snap-token" },
                },
                error: null,
              }),
          }),
        }),
        update: () => ({
          eq: () => Promise.resolve({ error: null }),
        }),
        delete: () => ({
          eq: () => Promise.resolve({ error: null }),
        }),
      } as any;
    }
    return {} as any;
  });

  const c = {
    req: {
      header: (key: string) => req.headers.get(key),
      json: () =>
        Promise.resolve({
          gateway: "midtrans",
          amount: 100,
          tenant_id: "kuala-api",
          metadata: { invoice_id: "inv-new" },
        }),
    },
    json: (body: any, status?: number) => ({ body, status: status || 200 }),
  } as unknown as Context;

  const fetchStub = stub(
    globalThis,
    "fetch",
    () => Promise.resolve(new Response(JSON.stringify([]), { status: 200 })),
  );

  // Stub the midtrans gateway to avoid calling real midtrans API
  const originalMidtrans = paymentGateways["midtrans"];
  paymentGateways["midtrans"] = {
    ...originalMidtrans,
    createTransaction: () =>
      Promise.resolve({
        token: "new-snap-token",
        redirect_url: "https://mock.url",
      } as any),
  } as any;

  try {
    const res = await handleInitiatePayment(c);
    assertEquals((res as any).status, 200);
    assertEquals((res as any).body.is_successful, true);
    assertEquals((res as any).body.data.order_id, "new-order-123");
    assertEquals((res as any).body.data.token, "new-snap-token");
  } finally {
    fetchStub.restore();
    selectStub.restore();
    paymentGateways["midtrans"] = originalMidtrans;
  }
});

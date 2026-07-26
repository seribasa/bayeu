// deno-lint-ignore-file no-explicit-any
import { assertEquals } from "@std/assert";
import { handleInitiatePayment } from "../../handlers/initiatePayment.ts";
import { Context } from "hono";
import { stub } from "@std/testing/mock";
import { paymentSupabaseAdmin } from "../../../_shared/paymentSupabase.ts";

function createMockToken(sub: string = "user_123"): string {
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = btoa(JSON.stringify({ sub, email: "test@example.com", user_metadata: { full_name: "Test User" } }));
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
  assertEquals((res as any).body.message, "Currency is required");
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
      redirect_url: "https://app.midtrans.com/snap/v2/vtweb/snap-existing-token",
    },
    metadata: {
      tenant_id: "kuala-api",
      invoice_id: "inv-999",
    },
  };

  const selectStub = stub(paymentSupabaseAdmin, "from", (table: string) => {
    if (table === "orders") {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              not: () => Promise.resolve({ data: [mockExistingOrder], error: null }),
            }),
          }),
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
          metadata: { invoice_id: "inv-999" },
        }),
    },
    json: (body: any, status?: number) => ({ body, status: status || 200 }),
  } as unknown as Context;

  try {
    const res = await handleInitiatePayment(c);
    assertEquals((res as any).status, 200);
    assertEquals((res as any).body.is_successful, true);
    assertEquals((res as any).body.data.order_id, "ord-existing-123");
    assertEquals((res as any).body.data.token, "snap-existing-token");
  } finally {
    selectStub.restore();
  }
});

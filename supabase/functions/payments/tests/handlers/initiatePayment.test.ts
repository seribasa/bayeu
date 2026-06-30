import { assertEquals } from "jsr:@std/assert";
import { handleInitiatePayment } from "../../handlers/initiatePayment.ts";
import { Context } from "jsr:@hono/hono";
import { stub } from "jsr:@std/testing/mock";
import { paymentSupabaseAdmin } from "../../../_shared/paymentSupabase.ts";

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

Deno.test("handleInitiatePayment - returns 400 if missing fields", async () => {
  const req = new Request("http://localhost/initiate-payment", {
    method: "POST",
    headers: { Authorization: "Bearer valid_token" },
  });
  
  const authStub = stub(
    paymentSupabaseAdmin.auth,
    "getUser",
    () => Promise.resolve({ data: { user: { id: "user_1" } }, error: null }) as any,
  );

  const c = {
    req: {
      header: (key: string) => req.headers.get(key),
      json: () => Promise.resolve({ gateway: "stripe" }), // Missing amount and tenant_id
    },
    json: (body: any, status: number) => ({ body, status }),
  } as unknown as Context;

  try {
    const res = await handleInitiatePayment(c);
    assertEquals((res as any).status, 400);
    assertEquals((res as any).body.message, "Currency is required"); // Because gateway is stripe
  } finally {
    authStub.restore();
  }
});

// deno-lint-ignore-file no-explicit-any
import { assertEquals } from "jsr:@std/assert";
import { handleInitiate } from "./initiate.ts";
import { Context } from "jsr:@hono/hono";
import { stub } from "jsr:@std/testing/mock";
import { paymentSupabaseAdmin } from "../../_shared/paymentSupabase.ts";
import { eImunisasiSupabaseAdmin } from "../../_shared/eimunisasiSupabase.ts";
import * as gateway from "../gateways/stripe.ts";
import * as midtrans from "../gateways/midtrans.ts";
import Stripe from "npm:stripe@18.0.0";

// Helper to build a fake Context
function buildContext(body: any, authHeader?: string): Context {
  return {
    req: {
      json: () => Promise.resolve(body),
      header: (
        name: string,
      ) => (name === "Authorization" ? authHeader : undefined),
    },
    json: (data: unknown, status?: number) =>
      new Response(JSON.stringify(data), { status }),
  } as unknown as Context;
}

Deno.test("handleInitiate - missing gateway in body returns 400", async () => {
  const ctx = buildContext({ items: [] }, "Bearer test.jwt");
  const res = await handleInitiate(ctx);
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.is_successful, false);
  assertEquals(body.message, "Payment gateway is required");
});

Deno.test("handleInitiate - invalid products returns 400", async () => {
  // stub products validation to return empty data
  const prodStub = stub(
    paymentSupabaseAdmin,
    "from",
    () => ({
      select: () => ({ in: () => Promise.resolve({ data: [], error: null }) }),
    } as any),
  );

  const ctx = buildContext({
    gateway: "stripe",
    currency: "usd",
    items: [{ id: "x", quantity: 1 }],
  }, "Bearer test.jwt");
  const res = await handleInitiate(ctx);
  prodStub.restore();

  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.is_successful, false);
  assertEquals(body.message, "Invalid products");
});

Deno.test("handleInitiate - missing auth header returns 401", async () => {
  // stub valid products
  const prodStub = stub(
    paymentSupabaseAdmin,
    "from",
    () => ({
      select: () => ({
        in: () =>
          Promise.resolve({
            data: [{ product_id: "x", price: 10 }],
            error: null,
          }),
      }),
    } as any),
  );

  const ctx = buildContext({
    gateway: "stripe",
    currency: "usd",
    items: [{ id: "x", quantity: 1 }],
  });
  const res = await handleInitiate(ctx);
  prodStub.restore();

  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(body.is_successful, false);
  assertEquals(body.message, "Unauthorized");
});

Deno.test("handleInitiate - stripe flow succeeds", async () => {
  // stub product lookup
  const prodStub = stub(
    paymentSupabaseAdmin,
    "from",
    (table: string) => {
      if (table === "products") {
        return {
          select: () => ({
            in: () =>
              Promise.resolve({
                data: [{ product_id: "x", price: 10 }],
                error: null,
              }),
          }),
        } as any;
      }
      if (table === "orders") {
        return {
          insert: () => ({
            select: () => ({
              single: () =>
                Promise.resolve({ data: { order_id: "o1" }, error: null }),
            }),
          }),
          update: () => ({
            eq: () => Promise.resolve({ error: null }),
          }),
        } as any;
      }
      if (table === "order_items") {
        return { insert: () => Promise.resolve({ error: null }) } as any;
      }
      return { update: () => Promise.resolve({ error: null }) } as any;
    },
  );
  // stub user auth
  const userStub = stub(
    eImunisasiSupabaseAdmin.auth,
    "getUser",
    () =>
      Promise.resolve(
        {
          data: {
            user: {
              id: "u1",
              email: "a@b.com",
              user_metadata: { name: "Joe" },
            },
          },
          error: null,
        } as any,
      ),
  );

  const mockPaymentIntent: any = {
    client_secret: "pi_test_secret",
  };

  const stripeStub = stub(
    gateway.stripe.paymentIntents,
    "create",
    () =>
      Promise.resolve(
        mockPaymentIntent as Stripe.Response<Stripe.PaymentIntent>,
      ),
  );

  const ctx = buildContext(
    { gateway: "stripe", currency: "usd", items: [{ id: "x", quantity: 1 }] },
    "Bearer token",
  );
  const res = await handleInitiate(ctx);

  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.is_successful, true);
  assertEquals(body.data.gateway, "stripe");

  // restore overrides
  prodStub.restore();
  stripeStub.restore();
  userStub.restore();
});

Deno.test("handleInitiate - midtrans flow succeeds", async () => {
  // stub product lookup
  const prodStub = stub(
    paymentSupabaseAdmin,
    "from",
    (table: string) => {
      if (table === "products") {
        return {
          select: () => ({
            in: () =>
              Promise.resolve({
                data: [{ product_id: "x", price: 10 }],
                error: null,
              }),
          }),
        } as any;
      }
      if (table === "orders") {
        return {
          insert: () => ({
            select: () => ({
              single: () =>
                Promise.resolve({ data: { order_id: "o1" }, error: null }),
            }),
          }),
          update: () => ({
            eq: () => Promise.resolve({ error: null }),
          }),
        } as any;
      }
      if (table === "order_items") {
        return { insert: () => Promise.resolve({ error: null }) } as any;
      }
      return { update: () => Promise.resolve({ error: null }) } as any;
    },
  );
  // stub user auth
  const userStub2 = stub(
    eImunisasiSupabaseAdmin.auth,
    "getUser",
    () =>
      Promise.resolve(
        {
          data: {
            user: {
              id: "u2",
              email: "c@d.com",
              user_metadata: { name: "Ann" },
            },
          },
          error: null,
        } as any,
      ),
  );
  const mockTransactionResponse: {
    token: string;
    redirect_url: string;
  } = {
    token: "mock_transaction_token",
    redirect_url: "https://mock.redirect.url",
  };

  const midtransStub = stub(
    midtrans.snap,
    "createTransaction",
    () => Promise.resolve(mockTransactionResponse),
  );

  const ctx = buildContext(
    { gateway: "midtrans", items: [{ id: "x", quantity: 1 }] },
    "Bearer token",
  );
  const res2 = await handleInitiate(ctx);

  assertEquals(res2.status, 200);
  const body2 = await res2.json();
  assertEquals(body2.is_successful, true);
  assertEquals(body2.data.gateway, "midtrans");

  // restore overrides
  prodStub.restore();
  midtransStub.restore();
  userStub2.restore();
});

// Invalid JSON body returns 400
Deno.test("handleInitiate - null body returns 400", async () => {
  const ctx = buildContext(null, "Bearer token");
  const res = await handleInitiate(ctx);
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.message, "Invalid request body");
});

// Non-object body returns 400
Deno.test("handleInitiate - primitive body returns 400", async () => {
  const ctx = buildContext("string", "Bearer token");
  const res = await handleInitiate(ctx);
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.message, "Invalid request body");
});

// Auth error from getUser returns 401
Deno.test("handleInitiate - auth failure returns 401", async () => {
  // valid products
  const prod = stub(
    paymentSupabaseAdmin,
    "from",
    () => ({
      select: () => ({
        in: () =>
          Promise.resolve({
            data: [{ product_id: "x", price: 1 }],
            error: null,
          }),
      }),
    } as any),
  );
  const userErr = stub(
    eImunisasiSupabaseAdmin.auth,
    "getUser",
    () => Promise.resolve({ data: null, error: { message: "fail" } } as any),
  );
  const ctx = buildContext({
    gateway: "stripe",
    currency: "usd",
    items: [{ id: "x", quantity: 1 }],
  }, "Bearer token");
  const res = await handleInitiate(ctx);
  prod.restore();
  userErr.restore();
  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(body.message, "Unauthorized");
});

// Order insert error returns 500 fallback
Deno.test("handleInitiate - order insert failure returns 500", async () => {
  const prod = stub(
    paymentSupabaseAdmin,
    "from",
    (table: string) =>
      table === "products"
        ? {
          select: () => ({
            in: () =>
              Promise.resolve({
                data: [{ product_id: "x", price: 1 }],
                error: null,
              }),
          }),
        } as any
        : { insert: () => Promise.reject(new Error("db error")) } as any,
  );
  const userOk = stub(
    eImunisasiSupabaseAdmin.auth,
    "getUser",
    () => Promise.resolve({ data: { user: { id: "u" } }, error: null } as any),
  );
  const ctx = buildContext({
    gateway: "stripe",
    currency: "usd",
    items: [{ id: "x", quantity: 1 }],
  }, "Bearer token");
  const res = await handleInitiate(ctx);
  prod.restore();
  userOk.restore();
  assertEquals(res.status, 500);
  const body = await res.json();
  assertEquals(body.message.includes("unable to process your payment"), true);
});

// Order_items insertion error returns 500
Deno.test("handleInitiate - order_items insert failure returns 500", async () => {
  // stub product lookup
  const prodStub = stub(
    paymentSupabaseAdmin,
    "from",
    (_table: string) => {
      if (_table === "products") {
        return {
          select: () => ({
            in: () =>
              Promise.resolve({
                data: [{ product_id: "x", price: 1 }],
                error: null,
              }),
          }),
        } as any;
      }
      if (_table === "orders") {
        return {
          insert: () => ({
            select: () => ({
              single: () =>
                Promise.resolve({ data: { order_id: "o" }, error: null }),
            }),
          }),
        } as any;
      }
      if (_table === "order_items") {
        return { insert: () => Promise.reject(new Error("items fail")) } as any;
      }
      return { update: () => Promise.resolve({ error: null }) } as any;
    },
  );
  const userOk = stub(
    eImunisasiSupabaseAdmin.auth,
    "getUser",
    () => Promise.resolve({ data: { user: { id: "u" } }, error: null } as any),
  );
  const ctx = buildContext({
    gateway: "stripe",
    currency: "usd",
    items: [{ id: "x", quantity: 1 }],
  }, "Bearer token");
  const res = await handleInitiate(ctx);

  prodStub.restore();
  userOk.restore();
  assertEquals(res.status, 500);
});

// Update order error returns 500
Deno.test("handleInitiate - update order failure returns 500", async () => {
  const prod = stub(
    paymentSupabaseAdmin,
    "from",
    (table: string) => {
      if (table === "products") {
        return {
          select: () => ({
            in: () =>
              Promise.resolve({
                data: [{ product_id: "x", price: 1 }],
                error: null,
              }),
          }),
        } as any;
      }
      if (table === "orders") {
        return {
          insert: () => ({
            select: () => ({
              single: () =>
                Promise.resolve({ data: { order_id: "o" }, error: null }),
            }),
          }),
          update: () => ({
            eq: () => Promise.resolve({ error: { message: "fail" } }),
          }),
          delete: () => ({
            eq: () => Promise.resolve({ error: null }),
          }),
        } as any;
      }
      if (table === "order_items") {
        return {
          insert: () => Promise.resolve({ error: null }),
          delete: () => ({
            eq: () => Promise.resolve({ error: null }),
          }),
        } as any;
      }
      return {
        update: () => ({
          eq: () => Promise.resolve({ error: { message: "fail" } }),
        }),
      } as any;
    },
  );
  const userOk = stub(
    eImunisasiSupabaseAdmin.auth,
    "getUser",
    () =>
      Promise.resolve({
        data: {
          user: {
            id: "u",
            email: "e",
            user_metadata: {
              name: "User",
            },
          },
        },
        error: null,
      } as any),
  );

  const mockPaymentIntent: any = {
    client_secret: "pi_test_secret",
  };

  const stripeStub = stub(
    gateway.stripe.paymentIntents,
    "create",
    () =>
      Promise.resolve(
        mockPaymentIntent as Stripe.Response<Stripe.PaymentIntent>,
      ),
  );
  const ctx = buildContext({
    gateway: "stripe",
    currency: "usd",
    items: [{ id: "x", quantity: 1 }],
  }, "Bearer token");
  const res = await handleInitiate(ctx);
  prod.restore();
  userOk.restore();
  stripeStub.restore();

  assertEquals(res.status, 500);
  const body = await res.json();
  assertEquals(body.message, "Failed to update order");
});

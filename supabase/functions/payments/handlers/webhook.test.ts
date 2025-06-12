// deno-lint-ignore-file no-explicit-any
import { assertEquals } from "jsr:@std/assert";
import { handleWebhook } from "./webhook.ts";
import { stub } from "jsr:@std/testing/mock";
import { Context } from "jsr:@hono/hono";
import { stripe } from "../gateways/stripe.ts";
import { paymentSupabaseAdmin } from "../../_shared/paymentSupabase.ts";

Deno.test("handleWebhook - missing payment_gateway returns 400", async () => {
  const mockContext = {
    req: {
      param: (_: string) => undefined,
    },
    json: (data: unknown, status?: number) => ({ data, status }),
  } as unknown as Context;

  const res: any = await handleWebhook(mockContext);
  assertEquals(res.status, 400);
  assertEquals(res.data.is_successful, false);
  assertEquals(res.data.message, "Payment gateway not specified");
});

Deno.test("handleWebhook - unknown source returns 400", async () => {
  const mockContext = {
    req: {
      param: (_: string) => "foo",
      text: () => Promise.resolve("{}"),
      json: () => Promise.resolve({}),
      header: (_: string) => undefined,
    },
    json: (data: any, status?: number) => ({ data, status }),
  } as unknown as Context;

  const res: any = await handleWebhook(mockContext);
  assertEquals(res.status, 400);
  assertEquals(res.data.is_successful, false);
  assertEquals(res.data.message, "Unknown webhook source");
});

Deno.test("handleWebhook - midtrans invalid signature returns 403", async () => {
  const mockContext = {
    req: {
      param: (_: string) => "midtrans",
      text: () => Promise.resolve(JSON.stringify({ signature_key: "sig" })),
      json: () =>
        Promise.resolve({
          signature_key: "invalid_signature",
        }),
      header: (_: string) => undefined,
    },
    json: (data: any, status?: number) => ({ data, status }),
  } as unknown as Context;

  const res: any = await handleWebhook(mockContext);
  assertEquals(res.status, 403);
  assertEquals(res.data.is_successful, false);
  assertEquals(res.data.message, "Invalid Midtrans signature");
});

Deno.test("handleWebhook - midtrans valid signature returns 200", async () => {
  const gatewayQuery: any = {
    select: () => ({
      eq: () => ({
        single: () =>
          Promise.resolve({
            data: {
              gateway_id: "midtrans",
            },
            error: null,
          }),
      }),
    }),
  };
  const transactionsQuery: any = {
    update: () => ({
      eq: () =>
        Promise.resolve({
          data: [],
          error: null,
        }),
    }),
  };
  const fromStub = stub(
    paymentSupabaseAdmin,
    "from",
    (table: string) => {
      if (table === "payment_gateway") return gatewayQuery;
      if (table === "transactions") return transactionsQuery;
      return {} as any;
    },
  );
  const mockContext = {
    req: {
      param: (_: string) => "midtrans",
      text: () => Promise.resolve(JSON.stringify({ signature_key: "sig" })),
      json: () =>
        Promise.resolve({
          order_id: "Postman-1578568851",
          status_code: "200",
          gross_amount: "10000.00",
          transaction_status: "settlement",
          signature_key:
            "e78e2223638cb60dbdbc88d23deb9b927ac41be7263ab38758605bac834dc25425705543707504bfef0802914cfa3f5f538fa308d1f9086211c420e7892ba2ba",
          server_key: "VT-server-HJMpl9HLr_ntOKt5mRONdmKj",
        }),
      header: (_: string) => undefined,
    },
    json: (data: any, status?: number) => ({ data, status }),
  } as unknown as Context;

  try {
    const res: any = await handleWebhook(mockContext);
    assertEquals(res.status, 200);
    assertEquals(res.data.is_successful, true);
    assertEquals(res.data.message, "Midtrans webhook processed");
  } finally {
    fromStub.restore();
  }
});

Deno.test("handleWebhook - stripe invalid signature returns 403", async () => {
  const mockContext = {
    req: {
      param: (_: string) => "stripe",
      text: () => Promise.resolve("{}"),
      json: () => Promise.resolve({}),
      header: (
        name: string,
      ) => (name === "stripe-signature" ? "sig" : undefined),
    },
    json: (data: any, status?: number) => ({ data, status }),
  } as unknown as Context;

  const res: any = await handleWebhook(mockContext);
  assertEquals(res.status, 403);
  assertEquals(res.data.is_successful, false);
  assertEquals(res.data.message, "Invalid Stripe signature");
});

Deno.test("handleWebhook - stripe valid signature returns 200", async () => {
  const mockEvent: any = {
    id: "evt_test",
    type: "payment_intent.succeeded",
    data: {
      object: {
        id: "pi_test",
        amount: 1000,
        currency: "usd",
        status: "succeeded",
        metadata: {
          order_id: "test-order",
          customer_id: "test-customer",
        },
      },
    },
    created: Date.now(),
  };

  const stripeStub = stub(
    stripe.webhooks,
    "constructEventAsync",
    () => Promise.resolve(mockEvent),
  );
  const gatewayQuery: any = {
    select: () => ({
      eq: () => ({
        single: () =>
          Promise.resolve({
            data: {
              gateway_id: "midtrans",
            },
            error: null,
          }),
      }),
    }),
  };
  const transactionsQuery: any = {
    update: () => ({
      eq: () =>
        Promise.resolve({
          data: [],
          error: null,
        }),
    }),
  };
  const fromStub = stub(
    paymentSupabaseAdmin,
    "from",
    (table: string) => {
      if (table === "payment_gateway") return gatewayQuery;
      if (table === "transactions") return transactionsQuery;
      return {} as any;
    },
  );
  const mockContext = {
    req: {
      param: (_: string) => "stripe",
      text: () => Promise.resolve("{}"),
      json: () => Promise.resolve({}),
      header: (
        name: string,
      ) => (name === "stripe-signature" ? "sig" : undefined),
    },
    json: (data: any, status?: number) => ({ data, status }),
  } as unknown as Context;

  try {
    const res: any = await handleWebhook(mockContext);
    assertEquals(res.status, 200);
    assertEquals(res.data.is_successful, true);
    assertEquals(res.data.message, "Stripe webhook processed");
  } finally {
    stripeStub.restore();
    fromStub.restore();
  }
});

Deno.test("handleWebhook - midtrans handler error returns 500", async () => {
  const gatewayQuery: any = {
    select: () => ({
      eq: () => ({
        single: () =>
          Promise.reject({
            code: "PGRST116",
            message: "Gateway not found",
            details: "Payment gateway midtrans not found",
          }),
      }),
    }),
  };
  const fromStub = stub(
    paymentSupabaseAdmin,
    "from",
    (table: string) => {
      if (table === "payment_gateway") return gatewayQuery;
      return {} as any;
    },
  );
  const mockContext = {
    req: {
      param: () => "midtrans",
      text: () => Promise.resolve(JSON.stringify({ signature_key: "sig" })),
      json: () =>
        Promise.resolve({
          order_id: "Postman-1578568851",
          status_code: "200",
          gross_amount: "10000.00",
          transaction_status: "settlement",
          signature_key:
            "e78e2223638cb60dbdbc88d23deb9b927ac41be7263ab38758605bac834dc25425705543707504bfef0802914cfa3f5f538fa308d1f9086211c420e7892ba2ba",
          server_key: "VT-server-HJMpl9HLr_ntOKt5mRONdmKj",
        }),
      header: () => undefined,
    },
    json: (data: any, status?: number) => ({ data, status }),
  } as unknown as Context;

  const res: any = await handleWebhook(mockContext);
  assertEquals(res.status, 500);
  assertEquals(res.data.is_successful, false);
  assertEquals(res.data.message, "Internal server error");
  fromStub.restore();
});

Deno.test("handleWebhook - stripe handler error returns 500", async () => {
  const mockEvent: any = {
    id: "evt_test",
    type: "payment_intent.succeeded",
    data: {
      object: {
        id: "pi_test",
        amount: 1000,
        currency: "usd",
        status: "succeeded",
        metadata: {
          order_id: "test-order",
          customer_id: "test-customer",
        },
      },
    },
    created: Date.now(),
  };

  const stripeStub = stub(
    stripe.webhooks,
    "constructEventAsync",
    () => Promise.resolve(mockEvent),
  );
  const gatewayQuery: any = {
    select: () => ({
      eq: () => ({
        single: () =>
          Promise.reject({
            code: "PGRST116",
            message: "Gateway not found",
            details: "Payment gateway stripe not found",
          }),
      }),
    }),
  };
  const fromStub = stub(
    paymentSupabaseAdmin,
    "from",
    (table: string) => {
      if (table === "payment_gateway") return gatewayQuery;
      return {} as any;
    },
  );
  const mockContext = {
    req: {
      param: () => "stripe",
      text: () => Promise.resolve("{}"),
      json: () => Promise.resolve({}),
      header: (
        name: string,
      ) => (name === "stripe-signature" ? "sig" : undefined),
    },
    json: (data: any, status?: number) => ({ data, status }),
  } as unknown as Context;
  try {
    const res: any = await handleWebhook(mockContext);
    assertEquals(res.status, 500);
    assertEquals(res.data.is_successful, false);
    assertEquals(res.data.message, "Internal server error");
  } finally {
    stripeStub.restore();
    fromStub.restore();
  }
});

Deno.test("handleWebhook - text parsing error returns 500", async () => {
  const mockContext = {
    req: {
      param: () => "midtrans",
      text: () => Promise.reject(new Error("text error")),
      json: () => Promise.resolve({ signature_key: "sig" }),
      header: () => undefined,
    },
    json: (data: any, status?: number) => ({ data, status }),
  } as unknown as Context;

  const res: any = await handleWebhook(mockContext);
  assertEquals(res.status, 500);
  assertEquals(res.data.is_successful, false);
  assertEquals(res.data.message, "Internal server error");
});

Deno.test("handleWebhook - json parsing error returns 500", async () => {
  const mockContext = {
    req: {
      param: () => "stripe",
      text: () => Promise.resolve('{}'),
      json: () => Promise.reject(new Error("json error")),
      header: (name: string) => (name === 'stripe-signature' ? 'sig' : undefined),
    },
    json: (data: any, status?: number) => ({ data, status }),
  } as unknown as Context;

  const res: any = await handleWebhook(mockContext);
  assertEquals(res.status, 500);
  assertEquals(res.data.is_successful, false);
  assertEquals(res.data.message, "Internal server error");
});

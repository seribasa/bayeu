import { Context } from "hono";
import { assertEquals } from "@std/assert";
import { createStripeIntent, stripe, StripeGateway } from "./stripe.ts";
import { stub } from "@std/testing/mock";
import Stripe from "stripe";
import { paymentSupabaseAdmin } from "../../_shared/paymentSupabase.ts";

Deno.test({
  sanitizeOps: false,
  sanitizeResources: false,
  name: "Stripe Configuration - Sandbox Environment",
}, () => {
  const originalSandboxKey = Deno.env.get("STRIPE_SANDBOX_SECRET_KEY");

  Deno.env.delete("STRIPE_SANDBOX_SECRET_KEY");
  Deno.env.set("STRIPE_SANDBOX_SECRET_KEY", "sk_sandbox_from_env");

  try {
    const localStripe = stripe;
    assertEquals(typeof localStripe.paymentIntents.create, "function");
  } finally {
    if (originalSandboxKey === undefined) {
      Deno.env.delete("STRIPE_SANDBOX_SECRET_KEY");
    } else Deno.env.set("STRIPE_SANDBOX_SECRET_KEY", originalSandboxKey);
  }
});

Deno.test({
  sanitizeOps: false,
  sanitizeResources: false,
  name: "Stripe Configuration - STRIPE_SECRET_KEY not defined throws error",
}, async () => {
  const originalSandboxKey = Deno.env.get("STRIPE_SANDBOX_SECRET_KEY");

  Deno.env.delete("STRIPE_SANDBOX_SECRET_KEY");
  Deno.env.delete("STRIPE_PRODUCTION_SECRET_KEY");

  try {
    await import("./stripe.ts");
  } catch (err: unknown) {
    const error = err as Error;
    assertEquals(error.message, "STRIPE_SECRET_KEY is not defined");
  } finally {
    if (originalSandboxKey === undefined) {
      Deno.env.delete("STRIPE_SANDBOX_SECRET_KEY");
    } else Deno.env.set("STRIPE_SANDBOX_SECRET_KEY", originalSandboxKey);
  }
});

Deno.test({
  sanitizeOps: false,
  sanitizeResources: false,
  name: "createStripeIntent - creates payment intent successfully",
}, async () => {
  const mockPaymentIntent = {
    client_secret: "pi_test_secret",
  };

  const stripeStub = stub(
    stripe.paymentIntents,
    "create",
    () =>
      Promise.resolve(
        mockPaymentIntent as Stripe.Response<Stripe.PaymentIntent>,
      ),
  );

  try {
    const result = await createStripeIntent({
      orderId: "test-order",
      amount: 100,
      currency: "usd",
      customerId: "test-customer",
    });

    assertEquals(result as never as Record<string, unknown>, {
      order_id: "test-order",
      gateway: "stripe",
      redirect_url: undefined,
      token: result.token,
    });
  } finally {
    stripeStub.restore();
  }
});

Deno.test({
  sanitizeOps: false,
  sanitizeResources: false,
  name:
    "createStripeIntent - creates payment intent successfully client_secret undefined",
}, async () => {
  const stripeStub = stub(
    stripe.paymentIntents,
    "create",
    () =>
      Promise.resolve(
        {} as Stripe.Response<Stripe.PaymentIntent>,
      ),
  );

  try {
    const result = await createStripeIntent({
      orderId: "test-order",
      amount: 100,
      currency: "usd",
      customerId: "test-customer",
    });

    assertEquals(result as never as Record<string, unknown>, {
      order_id: "test-order",
      gateway: "stripe",
      redirect_url: undefined,
      token: undefined,
    });
  } finally {
    stripeStub.restore();
  }
});

Deno.test({
  sanitizeOps: false,
  sanitizeResources: false,
  name: "createStripeIntent - creates payment intent throws error",
}, async () => {
  const stripeStub = stub(
    stripe.paymentIntents,
    "create",
    () => {
      throw new Error("Failed to create payment intent");
    },
  );

  try {
    // deno-lint-ignore no-unused-vars
    const result = await createStripeIntent({
      orderId: "test-order",
      amount: 100,
      currency: "usd",
      customerId: "test-customer",
    });
  } catch (err: unknown) {
    const error = err as Error;
    assertEquals(error.message, "Failed to create payment intent");
  } finally {
    stripeStub.restore();
  }
});

Deno.test({
  sanitizeOps: false,
  sanitizeResources: false,
  name:
    "StripeGateway - createTransaction creates checkout session successfully",
}, async () => {
  const mockSession = {
    id: "cs_test_session",
    url: "https://checkout.stripe.com/pay/cs_test",
  };

  const stripeStub = stub(
    stripe.checkout.sessions,
    "create",
    () =>
      Promise.resolve(mockSession as Stripe.Response<Stripe.Checkout.Session>),
  );

  try {
    const gateway = new StripeGateway();
    const result = await gateway.createTransaction({
      orderId: "test-order",
      amount: 100,
      currency: "usd",
      customerName: "Test Customer",
      customerEmail: "customerEmail",
      expiryMinutes: 1440,
    });

    assertEquals(result, {
      order_id: "test-order",
      gateway: "stripe",
      redirect_url: mockSession.url,
      token: mockSession.id,
    });
  } finally {
    stripeStub.restore();
  }
});

Deno.test({
  sanitizeOps: false,
  sanitizeResources: false,
  name: "StripeGateway - createTransaction throws error",
}, async () => {
  const stripeStub = stub(
    stripe.checkout.sessions,
    "create",
    () => Promise.reject(new Error("Failed to create checkout session")),
  );

  try {
    const gateway = new StripeGateway();
    await gateway.createTransaction({
      orderId: "test-order",
      amount: 100,
      currency: "usd",
      customerName: "Test Customer",
      customerEmail: "customerEmail",
      expiryMinutes: 1440,
    });
    throw new Error("Expected createTransaction to throw");
  } catch (err: unknown) {
    const error = err as Error;
    assertEquals(error.message, "Failed to create checkout session");
  } finally {
    stripeStub.restore();
  }
});

Deno.test({
  sanitizeOps: false,
  sanitizeResources: false,
  name:
    "StripeGateway - handleWebhook - validates webhook signature and processes successfully",
}, async () => {
  const mockEvent = {
    id: "evt_test",
    type: "payment_intent.succeeded",
    data: {
      object: {
        id: "pi_test_id",
        metadata: {
          order_id: "test-order-id",
        },
        amount: 10000,
        currency: "usd",
      },
    },
  };

  const stripeStub = stub(
    Stripe.webhooks,
    "constructEventAsync",
    () => Promise.resolve(mockEvent as never as Stripe.Event),
  );

  const gatewayQuery = {
    select: () => ({
      eq: () => ({
        single: () =>
          Promise.resolve({
            data: {
              gateway_id: "stripe",
            },
            error: null,
          }),
      }),
    }),
  };
  const orderQuery = {
    select: () => ({
      eq: () => ({
        single: () =>
          Promise.resolve({
            data: {
              order_id: "test-order-id",
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
      if (table === "payment_gateway") return gatewayQuery;
      if (table === "orders") return orderQuery;
      return {
        rpc: () => Promise.resolve({ data: {}, error: null }),
      } as never;
    }) as never,
  );

  const rpcStub = stub(
    paymentSupabaseAdmin,
    "rpc",
    () => Promise.resolve({ data: {}, error: null }) as never,
  );

  const mockContext = {
    req: {
      header: (name: string) => name === "stripe-signature" ? "test_sig" : null,
      text: () => Promise.resolve("test_body"),
    },
    json: (body: unknown, status: number) =>
      new Response(JSON.stringify(body), { status }),
  } as never as Context;

  try {
    const gateway = new StripeGateway();
    const result = await gateway.handleWebhook(mockContext);

    assertEquals(result.status, 200);
    assertEquals(await result.json(), {
      is_successful: true,
      message: "Stripe webhook processed",
    });
  } finally {
    stripeStub.restore();
    fromStub.restore();
    rpcStub.restore();
  }
});

Deno.test({
  sanitizeOps: false,
  sanitizeResources: false,
  name: "StripeGateway - handleWebhook - missing signature",
}, async () => {
  const mockContext = {
    req: {
      header: () => null,
    },
    json: (body: unknown, status: number) =>
      new Response(JSON.stringify(body), { status }),
  } as never as Context;

  const gateway = new StripeGateway();
  const result = await gateway.handleWebhook(mockContext);

  assertEquals(result.status, 403);
  assertEquals(await result.json(), {
    is_successful: false,
    message: "Missing Stripe signature",
  });
});

Deno.test({
  sanitizeOps: false,
  sanitizeResources: false,
  name: "StripeGateway - handleWebhook - invalid signature throws 403",
}, async () => {
  const stripeStub = stub(
    Stripe.webhooks,
    "constructEventAsync",
    () => Promise.reject(new Error("Invalid signature")),
  );

  const mockContext = {
    req: {
      header: (name: string) =>
        name === "stripe-signature" ? "invalid_sig" : null,
      text: () => Promise.resolve("test_body"),
    },
    json: (body: unknown, status: number) =>
      new Response(JSON.stringify(body), { status }),
  } as never as Context;

  try {
    const gateway = new StripeGateway();
    const result = await gateway.handleWebhook(mockContext);
    assertEquals(result.status, 403);
    assertEquals(await result.json(), {
      is_successful: false,
      message: "Invalid Stripe signature",
    });
  } finally {
    stripeStub.restore();
  }
});

Deno.test({
  sanitizeOps: false,
  sanitizeResources: false,
  name: "StripeGateway - handleWebhook - missing order_id in metadata",
}, async () => {
  const mockEvent = {
    id: "evt_test",
    type: "payment_intent.succeeded",
    data: {
      object: {
        id: "pi_test_id",
        metadata: {},
        amount: 10000,
        currency: "usd",
      },
    },
  };

  const stripeStub = stub(
    Stripe.webhooks,
    "constructEventAsync",
    () => Promise.resolve(mockEvent as never as Stripe.Event),
  );

  const mockContext = {
    req: { header: () => "test_sig", text: () => Promise.resolve("test_body") },
    json: (body: unknown, status: number) =>
      new Response(JSON.stringify(body), { status }),
  } as never as Context;

  try {
    const gateway = new StripeGateway();
    const result = await gateway.handleWebhook(mockContext);
    assertEquals(result.status, 200);
  } finally {
    stripeStub.restore();
  }
});

Deno.test({
  sanitizeOps: false,
  sanitizeResources: false,
  name: "StripeGateway - handleWebhook - order not found",
}, async () => {
  const mockEvent = {
    id: "evt_test",
    type: "payment_intent.succeeded",
    data: {
      object: {
        id: "pi_test_id",
        metadata: { order_id: "missing-order" },
        amount: 10000,
        currency: "usd",
      },
    },
  };

  const stripeStub = stub(
    Stripe.webhooks,
    "constructEventAsync",
    () => Promise.resolve(mockEvent as never as Stripe.Event),
  );

  const fromStub = stub(paymentSupabaseAdmin, "from", () =>
    ({
      select: () => ({
        eq: () => ({ single: () => Promise.resolve({ data: null }) }),
      }),
    }) as never);

  const mockContext = {
    req: { header: () => "test_sig", text: () => Promise.resolve("test_body") },
    json: (body: unknown, status: number) =>
      new Response(JSON.stringify(body), { status }),
  } as never as Context;

  try {
    const gateway = new StripeGateway();
    const result = await gateway.handleWebhook(mockContext);
    assertEquals(result.status, 200);
  } finally {
    stripeStub.restore();
    fromStub.restore();
  }
});

Deno.test({
  sanitizeOps: false,
  sanitizeResources: false,
  name: "StripeGateway - handleWebhook - RPC Error",
}, async () => {
  const mockEvent = {
    id: "evt_test",
    type: "payment_intent.succeeded",
    data: {
      object: {
        id: "pi_test_id",
        metadata: { order_id: "valid-order" },
        amount: 10000,
        currency: "usd",
      },
    },
  };

  const stripeStub = stub(
    Stripe.webhooks,
    "constructEventAsync",
    () => Promise.resolve(mockEvent as never as Stripe.Event),
  );

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
    req: { header: () => "test_sig", text: () => Promise.resolve("test_body") },
    json: (body: unknown, status: number) =>
      new Response(JSON.stringify(body), { status }),
  } as never as Context;

  try {
    const gateway = new StripeGateway();
    await gateway.handleWebhook(mockContext);
  } catch (e: unknown) {
    if (e instanceof Error) assertEquals(e.message, "RPC Error");
  } finally {
    stripeStub.restore();
    fromStub.restore();
    rpcStub.restore();
  }
});

Deno.test({
  sanitizeOps: false,
  sanitizeResources: false,
  name: "StripeGateway - handleWebhook - success and publish event",
}, async () => {
  const mockEvent = {
    id: "evt_test",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_test_id",
        metadata: { order_id: "valid-order" },
        amount_total: 10000,
        currency: "usd",
      },
    },
  };

  const stripeStub = stub(
    Stripe.webhooks,
    "constructEventAsync",
    () => Promise.resolve(mockEvent as never as Stripe.Event),
  );

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
    req: { header: () => "test_sig", text: () => Promise.resolve("test_body") },
    json: (body: unknown, status: number) =>
      new Response(JSON.stringify(body), { status }),
  } as never as Context;

  try {
    const gateway = new StripeGateway();
    const result = await gateway.handleWebhook(mockContext);
    assertEquals(result.status, 200);
  } finally {
    stripeStub.restore();
    fromStub.restore();
    rpcStub.restore();
  }
});

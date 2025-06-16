// deno-lint-ignore-file no-explicit-any
import { assertEquals } from "jsr:@std/assert";
import {
  createStripeIntent,
  handleStripeWebhook,
  stripe,
  verifyStripeSignature,
} from "./stripe.ts";
import { stub } from "jsr:@std/testing/mock";
import Stripe from "npm:stripe@18.0.0";
import { paymentSupabaseAdmin } from "../../_shared/paymentSupabase.ts";

Deno.test("Stripe Configuration - Sandbox Environment", () => {
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

Deno.test("Stripe Configuration - STRIPE_SECRET_KEY not defined throws error", () => {
  const originalSandboxKey = Deno.env.get("STRIPE_SANDBOX_SECRET_KEY");

  Deno.env.delete("STRIPE_SANDBOX_SECRET_KEY");

  try {
    // deno-lint-ignore no-unused-vars
    const localStripe = stripe;
  } catch (err: unknown) {
    const error = err as Error;
    assertEquals(error.message, "STRIPE_SECRET_KEY is not defined");
  } finally {
    if (originalSandboxKey === undefined) {
      Deno.env.delete("STRIPE_SANDBOX_SECRET_KEY");
    } else Deno.env.set("STRIPE_SANDBOX_SECRET_KEY", originalSandboxKey);
  }
});

Deno.test("createStripeIntent - creates payment intent successfully", async () => {
  const mockPaymentIntent: any = {
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

    assertEquals(result, {
      order_id: "test-order",
      gateway: "stripe",
      redirect_url: undefined,
      token: result.token,
    });
  } finally {
    stripeStub.restore();
  }
});

Deno.test("createStripeIntent - creates payment intent successfully client_secret undefined", async () => {
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

    assertEquals(result, {
      order_id: "test-order",
      gateway: "stripe",
      redirect_url: undefined,
      token: undefined,
    });
  } finally {
    stripeStub.restore();
  }
});

Deno.test("createStripeIntent - creates payment intent throws error", async () => {
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

Deno.test("verifyStripeSignature - validates webhook signature", async () => {
  const mockEvent: any = {
    id: "evt_test",
    type: "payment_intent.succeeded",
  };

  const stripeStub = stub(
    Stripe.webhooks,
    "constructEventAsync",
    () => Promise.resolve(mockEvent),
  );
  try {
    const result = await verifyStripeSignature("test_sig", "test_body");

    assertEquals(result, {
      valid: true,
      event: mockEvent,
    });
  } finally {
    stripeStub.restore();
  }
});

Deno.test("verifyStripeSignature - validates webhook signature", async () => {
  const mockEvent: any = {
    id: "evt_test",
    type: "payment_intent.succeeded",
  };
  const originalWebhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET_KEY");
  Deno.env.delete("STRIPE_WEBHOOK_SECRET_KEY");

  const stripeStub = stub(
    Stripe.webhooks,
    "constructEventAsync",
    () => Promise.resolve(mockEvent),
  );
  try {
    const result = await verifyStripeSignature("{sig:test_sig}", "test_body");

    assertEquals(result, {
      valid: true,
      event: mockEvent,
    });
  } finally {
    stripeStub.restore();
    if (originalWebhookSecret === undefined) {
      Deno.env.delete("STRIPE_WEBHOOK_SECRET_KEY");
    } else {
      Deno.env.set("STRIPE_WEBHOOK_SECRET_KEY", originalWebhookSecret);
    }
  }
});

Deno.test("verifyStripeSignature - validates webhook signature throws error", async () => {
  const stripeStub = stub(
    Stripe.webhooks,
    "constructEventAsync",
    () => Promise.reject(new Error("Invalid signature")),
  );
  try {
    const result = await verifyStripeSignature("test_sig", "test_body");
    assertEquals(result, {
      valid: false,
    });
  } finally {
    stripeStub.restore();
  }
});

Deno.test("handleStripeWebhook - should handle valid webhook with event.type equal to 'payment_intent.created'", async () => {
  const mockResponse = {
    type: "payment_intent.created",
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
  const gatewayQuery: any = {
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
  const orderQuery: any = {
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
  const paymentQuery: any = {
    insert: () => ({
      select: () => ({
        single: () =>
          Promise.resolve({
            data: {
              payment_id: "test-payment-id",
              order_id: "test-order-id",
              gateway_payment_id: "test-transaction-id",
              gateway_id: "midtrans",
              amount: 10000,
              currency: "IDR",
              status: "pending",
            },
            error: null,
          }),
      }),
    }),
  };
  const transactionsQuery: any = {
    insert: () =>
      Promise.resolve({
        data: {},
        error: null,
      }),
  };
  const fromStub = stub(
    paymentSupabaseAdmin,
    "from",
    (table: string) => {
      if (table === "payment_gateway") return gatewayQuery;
      if (table === "transactions") return transactionsQuery;
      if (table === "orders") return orderQuery;
      if (table === "payments") return paymentQuery;
      return {} as any;
    },
  );

  try {
    const response = await handleStripeWebhook(mockResponse);
    // response should be an void function
    assertEquals(response, undefined);
  } finally {
    fromStub.restore();
  }
});

Deno.test("handleStripeWebhook - should throw error when payment gateway not found", async () => {
  const mockResponse = {
    type: "payment_intent.created",
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
  const gatewayQuery: any = {
    select: () => ({
      eq: () => ({
        single: () =>
          Promise.resolve({
            data: null,
            error: { message: "Payment gateway not found" },
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

  try {
    await handleStripeWebhook(mockResponse);
    throw new Error("Expected handleMidtransWebhook to throw");
  } catch (err: unknown) {
    const error = err as Error;
    assertEquals(error.message, "Payment gateway not found");
  } finally {
    fromStub.restore();
  }
});

Deno.test("handleStripeWebhook - should throw error when order error occurs", async () => {
  const mockResponse = {
    type: "payment_intent.created",
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
  const gatewayQuery: any = {
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
  const orderQuery: any = {
    select: () => ({
      eq: () => ({
        single: () =>
          Promise.resolve({
            data: null,
            error: { message: "Order not found" },
          }),
      }),
    }),
  };
  const fromStub = stub(
    paymentSupabaseAdmin,
    "from",
    (table: string) => {
      if (table === "payment_gateway") return gatewayQuery;
      if (table === "orders") return orderQuery;
      return {} as any;
    },
  );

  try {
    await handleStripeWebhook(mockResponse);
  } catch (err: unknown) {
    const error = err as Error;
    assertEquals(error.message, "Order not found");
  } finally {
    fromStub.restore();
  }
});

Deno.test("handleStripeWebhook - should throw error when payment creation fails", async () => {
  const mockResponse = {
    type: "payment_intent.created",
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
  const gatewayQuery: any = {
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
  const orderQuery: any = {
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
  const paymentQuery: any = {
    insert: () => ({
      select: () => ({
        single: () =>
          Promise.resolve({
            data: null,
            error: { message: "Failed to create payment" },
          }),
      }),
    }),
  };
  const fromStub = stub(
    paymentSupabaseAdmin,
    "from",
    (table: string) => {
      if (table === "payment_gateway") return gatewayQuery;
      if (table === "orders") return orderQuery;
      if (table === "payments") return paymentQuery;
      return {} as any;
    },
  );

  try {
    await handleStripeWebhook(mockResponse);
  } catch (err: unknown) {
    const error = err as Error;
    assertEquals(error.message, "Failed to create payment");
  } finally {
    fromStub.restore();
  }
});

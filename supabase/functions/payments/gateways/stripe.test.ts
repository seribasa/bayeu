// deno-lint-ignore-file no-explicit-any
import { assertEquals } from "jsr:@std/assert";
import {
  createStripeIntent,
  stripe,
  verifyStripeSignature,
} from "./stripe.ts";
import { stub } from "jsr:@std/testing/mock";
import Stripe from "npm:stripe@18.0.0";

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
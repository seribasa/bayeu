import Stripe from "npm:stripe@18.0.0";
import { paymentSupabaseAdmin } from "../../_shared/paymentSupabase.ts";
import {
  mapStripeToEnum,
  mapTransactionToStatus,
} from "../helpers/paymentHelper.ts";
import { CreatePaymentResponse } from "../../_shared/types/createPaymentResponse.ts";

const STRIPE_ENVIRONMENT = Deno.env.get("STRIPE_ENVIRONMENT");
const STRIPE_SANDBOX_SECRET_KEY = Deno.env.get("STRIPE_SANDBOX_SECRET_KEY");
const STRIPE_PRODUCTION_SECRET_KEY = Deno.env.get(
  "STRIPE_PRODUCTION_SECRET_KEY"
);
const STRIPE_SECRET_KEY =
  STRIPE_ENVIRONMENT === "production"
    ? STRIPE_PRODUCTION_SECRET_KEY
    : STRIPE_SANDBOX_SECRET_KEY;

if (!STRIPE_SECRET_KEY) {
  throw new Error("STRIPE_SECRET_KEY is not defined");
}

const STRIPE_WEBHOOK_SECRET_KEY = Deno.env.get("STRIPE_WEBHOOK_SECRET_KEY");

const stripe = new Stripe(STRIPE_SECRET_KEY);

async function createStripeIntent({
  orderId,
  amount,
  currency,
  // deno-lint-ignore no-unused-vars
  customerId,
}: {
  orderId: string;
  amount: number;
  currency: string;
  customerId: string;
}): Promise<CreatePaymentResponse> {
  try {
    const amountInCents = amount * 100; // Stripe requires amount in cents
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInCents,
      currency,
      metadata: {
        order_id: orderId,
      },
    });

    const response: CreatePaymentResponse = {
      order_id: orderId,
      gateway: "stripe",
      redirect_url: undefined,
      token: paymentIntent.client_secret || undefined,
    };

    return response;
  } catch (error) {
    console.error("Error creating payment intent:", error);
    throw error;
  }
}

// deno-lint-ignore no-explicit-any
async function verifyStripeSignature(sig: string, body: any) {
  try {
    const event = await stripe.webhooks.constructEventAsync(
      body,
      sig,
      STRIPE_WEBHOOK_SECRET_KEY || ""
    );
    return { valid: true, event };
  } catch (err) {
    console.log(err);
    return { valid: false };
  }
}

// deno-lint-ignore no-explicit-any
async function handleStripeWebhook(event: any) {
  // payment_intent.amount_capturable_updated
  // data.object is a payment intent
  // Occurs when a PaymentIntent has funds to be captured. Check the amount_capturable property on the PaymentIntent to determine the amount that can be captured. You may capture the PaymentIntent with an amount_to_capture value up to the specified amount. Learn more about capturing PaymentIntents.

  // payment_intent.canceled
  // data.object is a payment intent
  // Occurs when a PaymentIntent is canceled.

  // payment_intent.created
  // data.object is a payment intent
  // Occurs when a new PaymentIntent is created.

  // payment_intent.partially_funded
  // data.object is a payment intent
  // Occurs when funds are applied to a customer_balance PaymentIntent and the ‘amount_remaining’ changes.

  // payment_intent.payment_failed
  // data.object is a payment intent
  // Occurs when a PaymentIntent has failed the attempt to create a payment method or a payment.

  // payment_intent.processing
  // data.object is a payment intent
  // Occurs when a PaymentIntent has started processing.

  // payment_intent.requires_action
  // data.object is a payment intent
  // Occurs when a PaymentIntent transitions to requires_action state

  // payment_intent.succeeded
  // data.object is a payment intent
  // Occurs when a PaymentIntent has successfully completed payment
  try {
    const data = event.data.object;
    const orderId = data.metadata?.order_id;

    const txStatus = mapStripeToEnum(event.type);
    const { paymentStatus } = mapTransactionToStatus(txStatus);

    const { data: gateway } = await paymentSupabaseAdmin
      .from("payment_gateway")
      .select("gateway_id")
      .eq("name", "stripe")
      .single();

    if (!gateway) {
      throw new Error("Payment gateway not found");
    }

    if (event.type === "payment_intent.created") {
      const { data: order, error: errorOrder } = await paymentSupabaseAdmin
        .from("orders")
        .select("total_amount")
        .eq("order_id", orderId)
        .single();

      if (errorOrder) {
        console.error(errorOrder);
        throw new Error("Order not found");
      }

      const { data: payment } = await paymentSupabaseAdmin
        .from("payments")
        .insert({
          gateway_payment_id: data.id,
          order_id: orderId,
          gateway_id: gateway.gateway_id,
          amount: order.total_amount,
          currency: data.currency.toLowerCase(),
          status: paymentStatus,
        })
        .select("payment_id")
        .single();

      if (!payment) {
        throw new Error("Failed to create payment");
      }

      await paymentSupabaseAdmin.from("transactions").insert({
        payment_id: payment.payment_id,
        gateway_transaction_id: data.id,
        gateway_response: data,
        status: txStatus,
      });
      return;
    }

    await paymentSupabaseAdmin
      .from("transactions")
      .update({
        status: txStatus,
        gateway_response: data,
        updated_at: new Date(),
      })
      .eq("gateway_transaction_id", data.id);
  } catch (error) {
    console.error("Error handling Stripe webhook:", error);
    throw error;
  }
}

export { stripe, createStripeIntent, verifyStripeSignature, handleStripeWebhook };

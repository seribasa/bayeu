import Stripe from "stripe";
import { paymentSupabaseAdmin } from "../../_shared/paymentSupabase.ts";
import {
  mapStripeToEnum,
  mapTransactionToStatus,
  TransactionStatusEnum,
} from "../helpers/paymentHelper.ts";
import { publishPaymentEvent } from "../helpers/outpost.ts";
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

async function createStripeCheckout({
  orderId,
  amount,
  currency,
  expiryMinutes = 1440,
}: {
  orderId: string;
  amount: number;
  currency: string;
  webhookUrl?: string;
  expiryMinutes?: number;
}): Promise<CreatePaymentResponse> {
  try {
    const amountInCents = Math.round(amount * 100);
    const expiresAt = Math.floor(Date.now() / 1000) + Math.round(expiryMinutes * 60);

    const bayeuPublicUrl = Deno.env.get("SUPABASE_PUBLIC_URL") || "https://bayeu.peltops.com/functions/v1/payments";
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      currency,
      line_items: [
        {
          price_data: {
            currency,
            product_data: { name: `Invoice Order ${orderId}` },
            unit_amount: amountInCents,
          },
          quantity: 1,
        },
      ],
      metadata: {
        order_id: orderId,
      },
      payment_intent_data: {
        metadata: {
          order_id: orderId,
        },
      },
      success_url: `${bayeuPublicUrl}/redirect?order_id=${orderId}&event=success`,
      cancel_url: `${bayeuPublicUrl}/redirect?order_id=${orderId}&event=cancel`,
      expires_at: expiresAt,
    });

    const response: CreatePaymentResponse = {
      order_id: orderId,
      gateway: "stripe",
      redirect_url: session.url || undefined,
      token: session.id,
    };

    return response;
  } catch (error) {
    console.error("Error creating Stripe checkout session:", error);
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

    if (!orderId) {
      console.log("Stripe webhook missing metadata.order_id, skipping:", event.type);
      return;
    }

    const txStatus = mapStripeToEnum(event.type, data.payment_status);
    const { paymentStatus, orderStatus } = mapTransactionToStatus(txStatus);

    const { data: order } = await paymentSupabaseAdmin
      .from("orders")
      .select("total_amount, metadata")
      .eq("order_id", orderId)
      .single();

    if (!order) {
      console.error(`Order ${orderId} not found for Stripe webhook`);
      return;
    }

    const orderAmount = data.amount_total ? data.amount_total / 100 : (data.amount ? data.amount / 100 : order.total_amount);

    const transactionId = typeof data.payment_intent === 'string' ? data.payment_intent : (data.payment_intent?.id || data.id);

    const { data: rpcResult, error: rpcError } = await paymentSupabaseAdmin.rpc("process_payment_webhook", {
      p_order_id: orderId,
      p_gateway_name: "stripe",
      p_gateway_payment_id: transactionId,
      p_gateway_transaction_id: transactionId,
      p_amount: orderAmount,
      p_currency: (data.currency || "idr").toLowerCase(),
      p_payment_status: paymentStatus,
      p_transaction_status: txStatus,
      p_order_status: orderStatus,
      p_gateway_response: data,
    });

    if (rpcError) {
      console.error("RPC Error processing Stripe webhook:", rpcError);
      throw rpcError;
    }

    const metadata = rpcResult?.metadata || order.metadata;

    if (txStatus === TransactionStatusEnum.success && metadata?.tenant_id && !rpcResult?.already_paid) {
      await publishPaymentEvent(metadata.tenant_id, {
        order_id: orderId,
        status: "success",
        amount: orderAmount,
        metadata: metadata,
      });
    }
  } catch (error) {
    console.error("Error handling Stripe webhook:", error);
    throw error;
  }
}

export {
  createStripeCheckout,
  createStripeIntent,
  handleStripeWebhook,
  stripe,
  verifyStripeSignature,
};

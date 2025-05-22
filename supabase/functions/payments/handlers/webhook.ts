import { Context } from "jsr:@hono/hono";
import {
  verifyMidtransSignature,
  handleMidtransWebhook,
} from "../gateways/midtrans.ts";
import {
  verifyStripeSignature,
  handleStripeWebhook,
} from "../gateways/stripe.ts";

export const handleWebhook = async (c: Context) => {
  try {
    const paymentGateway = c.req.param("payment_gateway");

    if (!paymentGateway) {
      return c.json(
        {
          is_successful: false,
          message: "Payment gateway not specified",
        },
        400
      );
    }

    const rawBody = await c.req.text();
    const jsonBody = await c.req.json();

    // Detect webhook source
    const midtransSignatureKey = jsonBody?.signature_key;
    if (midtransSignatureKey && paymentGateway === "midtrans") {
      if (
        !verifyMidtransSignature({
          signature: midtransSignatureKey,
          body: jsonBody,
        })
      ) {
        console.error("Invalid Midtrans signature");
        return c.json(
          { is_successful: false, message: "Invalid Midtrans signature" },
          403
        );
      }
      await handleMidtransWebhook(jsonBody);
      return c.json({
        is_successful: true,
        message: "Midtrans webhook processed",
      });
    }

    const stripeSignature = c.req.header("stripe-signature");
    if (stripeSignature && paymentGateway === "stripe") {
      const stripeResult = await verifyStripeSignature(
        stripeSignature,
        rawBody
      );
      if (!stripeResult.valid) {
        console.error("Invalid Stripe signature");
        return c.json(
          { is_successful: false, message: "Invalid Stripe signature" },
          403
        );
      }

      await handleStripeWebhook(stripeResult.event);
      console.log("Stripe webhook processed:", stripeResult.event);
      return c.json({
        is_successful: true,
        message: "Stripe webhook processed",
      });
    }

    return c.json(
      { is_successful: false, message: "Unknown webhook source" },
      400
    );
  } catch (error) {
    console.error("Error processing webhook:", error);
    return c.json(
      { is_successful: false, message: "Internal server error" },
      500
    );
  }
};

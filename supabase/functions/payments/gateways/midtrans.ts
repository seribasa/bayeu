import Midtrans from "npm:midtrans-client@1.4.2";
import { paymentSupabaseAdmin } from "../../_shared/paymentSupabase.ts";
import {
  mapMidtransToEnum,
  mapTransactionToStatus,
} from "../helpers/paymentHelper.ts";
import { CreatePaymentResponse } from "../../_shared/types/createPaymentResponse.ts";
import * as mod from "node:crypto";

const MIDTRANS_ENVIRONMENT = Deno.env.get("MIDTRANS_ENVIRONMENT");
const MIDTRANS_SANDBOX_SERVER_KEY = Deno.env.get("MIDTRANS_SANDBOX_SERVER_KEY");
const MIDTRANS_SANDBOX_CLIENT_KEY = Deno.env.get("MIDTRANS_SANDBOX_CLIENT_KEY");
const MIDTRANS_PRODUCTION_SERVER_KEY = Deno.env.get(
  "MIDTRANS_PRODUCTION_SERVER_KEY"
);
const MIDTRANS_PRODUCTION_CLIENT_KEY = Deno.env.get(
  "MIDTRANS_PRODUCTION_CLIENT_KEY"
);

const MIDTRANS_SERVER_KEY =
  MIDTRANS_ENVIRONMENT === "production"
    ? MIDTRANS_PRODUCTION_SERVER_KEY
    : MIDTRANS_SANDBOX_SERVER_KEY;

const MIDTRANS_CLIENT_KEY =
  MIDTRANS_ENVIRONMENT === "production"
    ? MIDTRANS_PRODUCTION_CLIENT_KEY
    : MIDTRANS_SANDBOX_CLIENT_KEY;

const snap = new Midtrans.Snap({
  isProduction: false,
  serverKey: MIDTRANS_SERVER_KEY,
  clientKey: MIDTRANS_CLIENT_KEY,
});

async function createSnapMidtrans({
  orderId,
  totalAmount,
  customerName,
  customerEmail,
}: {
  orderId: string;
  totalAmount: number;
  customerName: string;
  customerEmail?: string;
}): Promise<CreatePaymentResponse> {
  const parameter = {
    transaction_details: {
      order_id: orderId,
      gross_amount: totalAmount,
    },
    customer_details: {
      first_name: customerName,
      last_name: "",
      email: customerEmail,
    },
    credit_card: {
      secure: true,
    },
    callbacks: {
      finish: "https://eimunisasi-app.peltops.com/payment/midtrans/finish",
      unfinish: "https://eimunisasi-app.peltops.com/payment/midtrans/unfinish",
      error: "https://eimunisasi-app.peltops.com/payment/midtrans/error",
    },
  };

  try {
    const transaction = await snap.createTransaction(parameter);

    const response: CreatePaymentResponse = {
      order_id: orderId,
      gateway: "midtrans",
      redirect_url: transaction.redirect_url,
      token: transaction.token,
    };
    return response;
  } catch (error) {
    console.error("Error creating Midtrans transaction:", error);
    throw error;
  }
}

function verifyMidtransSignature({
  signature,
  body,
}: {
  signature: string;
  body: {
    order_id: string;
    status_code: string;
    gross_amount: string;
    server_key?: string;
  };
}) {
  const sha512 = mod.createHash("sha512");
  sha512.update(
    body.order_id +
      body.status_code +
      body.gross_amount +
      (body.server_key || MIDTRANS_SERVER_KEY)
  );
  const expected = sha512.digest("hex");
  return signature === expected;
}

// deno-lint-ignore no-explicit-any
async function handleMidtransWebhook(data: any) {
  try {
    const { order_id, transaction_status, transaction_id, currency } = data;
    // EVENT:
    // capture
    // Transaction is successful and card balance is captured successfully.
    // settlement
    // The transaction is successfully settled. Funds have been credited to your account.
    // pending
    // The transaction is created and is waiting to be paid by the customer at the payment providers like Bank Transfer, E-Wallet, and so on. For card payment method: waiting for customer to complete (and card issuer to validate) 3DS/OTP process.
    // deny
    // The credentials used for payment are rejected by the payment provider or Midtrans Fraud Detection System (FDS).
    // cancel
    // The transaction is canceled. It can be triggered by merchant.
    // expire
    // Transaction is not available for processing, because the payment was delayed.
    // failure
    // Unexpected error occurred during transaction processing.
    // refund
    // Transaction is marked to be refunded. Refund status can be triggered by merchant.
    // partial_refund
    // Transaction is marked to be refunded partially (if you choose to refund in amount less than the paid amount). Refund status can be triggered by merchant.
    // authorize
    // Only available specifically only if you are using pre-authorize feature for card transactions (an advanced feature that you will not have by default, so in most cases are safe to ignore). Transaction is successful and card balance is reserved (authorized) successfully. You can later perform API “capture” to change it into capture, or if no action is taken will be auto released. Depending on your business use case, you may assume authorize status as a successful transaction.

    const txStatus = mapMidtransToEnum(transaction_status);
    const { paymentStatus } = mapTransactionToStatus(txStatus);

    const { data: gateway } = await paymentSupabaseAdmin
      .from("payment_gateway")
      .select("gateway_id")
      .eq("name", "midtrans")
      .single();

    if (!gateway) {
      throw new Error("Payment gateway not found");
    }

    if (transaction_status === "pending") {
      const { data: order, error: errorOrder } = await paymentSupabaseAdmin
        .from("orders")
        .select("total_amount")
        .eq("order_id", order_id)
        .single();

      if (errorOrder) {
        console.error(errorOrder);
        throw new Error("Order not found");
      }

      const { data: payment, error: errorPayment } = await paymentSupabaseAdmin
        .from("payments")
        .insert({
          gateway_payment_id: transaction_id,
          order_id,
          gateway_id: gateway.gateway_id,
          amount: order.total_amount,
          currency: currency.toLowerCase(),
          status: paymentStatus,
        })
        .select()
        .single();

      if (errorPayment) {
        console.error(errorPayment);
        throw new Error("Failed to create payment");
      }

      await paymentSupabaseAdmin.from("transactions").insert({
        payment_id: payment.payment_id,
        gateway_transaction_id: transaction_id,
        gateway_response: data,
        status: txStatus,
      });
    }

    await paymentSupabaseAdmin
      .from("transactions")
      .update({
        status: txStatus,
        gateway_response: data,
        updated_at: new Date(),
      })
      .eq("gateway_transaction_id", transaction_id);
  } catch (error) {
    console.error("Error handling Midtrans webhook:", error);
    throw error;
  }
}

export { snap, createSnapMidtrans, verifyMidtransSignature, handleMidtransWebhook };

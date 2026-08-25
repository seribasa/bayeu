import { Context } from "hono";
import Midtrans from "midtrans-client";
import { paymentSupabaseAdmin } from "../../../../../_shared/paymentSupabase.ts";
import {
  mapMidtransToEnum,
  mapTransactionToStatus,
  TransactionStatusEnum,
} from "../../mappers/paymentMapper.ts";
import { publishPaymentEvent } from "../../services/OutpostService.ts";
import { CreatePaymentResponse } from "../../../../../_shared/types/createPaymentResponse.ts";
import * as mod from "node:crypto";
import {
  IPaymentGateway,
  PaymentParams,
} from "../../../domain/gateways/interfaces.ts";

const MIDTRANS_ENVIRONMENT = Deno.env.get("MIDTRANS_ENVIRONMENT");
const MIDTRANS_SANDBOX_SERVER_KEY = Deno.env.get("MIDTRANS_SANDBOX_SERVER_KEY");
const MIDTRANS_SANDBOX_CLIENT_KEY = Deno.env.get("MIDTRANS_SANDBOX_CLIENT_KEY");
const MIDTRANS_PRODUCTION_SERVER_KEY = Deno.env.get(
  "MIDTRANS_PRODUCTION_SERVER_KEY",
);
const MIDTRANS_PRODUCTION_CLIENT_KEY = Deno.env.get(
  "MIDTRANS_PRODUCTION_CLIENT_KEY",
);

const MIDTRANS_SERVER_KEY = MIDTRANS_ENVIRONMENT === "production"
  ? MIDTRANS_PRODUCTION_SERVER_KEY
  : MIDTRANS_SANDBOX_SERVER_KEY;

const MIDTRANS_CLIENT_KEY = MIDTRANS_ENVIRONMENT === "production"
  ? MIDTRANS_PRODUCTION_CLIENT_KEY
  : MIDTRANS_SANDBOX_CLIENT_KEY;

const snap = new Midtrans.Snap({
  isProduction: false,
  serverKey: MIDTRANS_SERVER_KEY,
  clientKey: MIDTRANS_CLIENT_KEY,
});

function getSnapDate(): string {
  const date = new Date();
  const yyyy = date.getFullYear();
  const MM = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${yyyy}-${MM}-${dd} ${hh}:${mm}:${ss} +0700`;
}

async function createSnapMidtrans({
  orderId,
  totalAmount,
  customerName,
  customerEmail,
  expiryMinutes,
}: {
  orderId: string;
  totalAmount: number;
  customerName: string;
  customerEmail?: string;
  expiryMinutes?: number;
}): Promise<CreatePaymentResponse> {
  const bayeuPublicUrl = Deno.env.get("SUPABASE_PUBLIC_URL") ||
    "https://bayeu.peltops.com/functions/v1/payments";
  // deno-lint-ignore no-explicit-any
  const parameter: any = {
    transaction_details: {
      order_id: orderId,
      gross_amount: Math.round(totalAmount),
    },
    customer_details: {
      first_name: customerName,
      last_name: "",
      email: customerEmail && customerEmail.includes("@")
        ? customerEmail
        : undefined,
    },
    credit_card: {
      secure: true,
    },
    callbacks: {
      finish: `${bayeuPublicUrl}/redirect?order_id=${orderId}&event=success`,
      unfinish: `${bayeuPublicUrl}/redirect?order_id=${orderId}&event=cancel`,
      error: `${bayeuPublicUrl}/redirect?order_id=${orderId}&event=failed`,
    },
  };

  if (expiryMinutes && expiryMinutes > 0) {
    parameter.expiry = {
      start_time: getSnapDate(),
      unit: "minutes",
      duration: expiryMinutes,
    };
  }

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
      (body.server_key || MIDTRANS_SERVER_KEY),
  );
  const expected = sha512.digest("hex");
  return signature === expected;
}

// deno-lint-ignore no-explicit-any
async function handleMidtransWebhook(data: any) {
  try {
    const {
      order_id,
      transaction_status,
      transaction_id,
      currency,
      gross_amount,
    } = data;
    if (!order_id) {
      console.log("Midtrans webhook missing order_id, skipping");
      return;
    }

    const txStatus = mapMidtransToEnum(transaction_status);
    const { paymentStatus, orderStatus } = mapTransactionToStatus(txStatus);

    const { data: order } = await paymentSupabaseAdmin
      .from("orders")
      .select("total_amount, metadata")
      .eq("order_id", order_id)
      .single();

    if (!order) {
      console.error(`Order ${order_id} not found for Midtrans webhook`);
      return;
    }

    const amount = gross_amount ? parseFloat(gross_amount) : order.total_amount;

    const { data: rpcResult, error: rpcError } = await paymentSupabaseAdmin.rpc(
      "process_payment_webhook",
      {
        p_order_id: order_id,
        p_gateway_name: "midtrans",
        p_gateway_payment_id: transaction_id || order_id,
        p_gateway_transaction_id: transaction_id || order_id,
        p_amount: amount,
        p_currency: (currency || "idr").toLowerCase(),
        p_payment_status: paymentStatus,
        p_transaction_status: txStatus,
        p_order_status: orderStatus,
        p_gateway_response: data,
      },
    );

    if (rpcError) {
      console.error("RPC Error processing Midtrans webhook:", rpcError);
      throw rpcError;
    }

    const metadata = rpcResult?.metadata || order.metadata;

    if (
      txStatus === TransactionStatusEnum.success && metadata?.tenant_id &&
      !rpcResult?.already_paid
    ) {
      await publishPaymentEvent(metadata.tenant_id, {
        order_id: order_id,
        status: "success",
        amount: amount,
        metadata: metadata,
      });
    }
  } catch (error) {
    console.error("Error handling Midtrans webhook:", error);
    throw error;
  }
}

export class MidtransGateway implements IPaymentGateway {
  async createTransaction(params: PaymentParams) {
    return await createSnapMidtrans({
      orderId: params.orderId,
      totalAmount: params.amount,
      customerName: params.customerName || "Customer",
      customerEmail: params.customerEmail,
      expiryMinutes: params.expiryMinutes,
    });
  }

  async handleWebhook(c: Context): Promise<Response> {
    const jsonBody = await c.req.json();
    const midtransSignatureKey = jsonBody?.signature_key;

    if (!midtransSignatureKey) {
      return c.json({
        is_successful: false,
        message: "Missing Midtrans signature",
      }, 403);
    }

    if (
      !verifyMidtransSignature({
        signature: midtransSignatureKey,
        body: jsonBody,
      })
    ) {
      console.error("Invalid Midtrans signature");
      return c.json({
        is_successful: false,
        message: "Invalid Midtrans signature",
      }, 403);
    }

    await handleMidtransWebhook(jsonBody);
    return c.json({
      is_successful: true,
      message: "Midtrans webhook processed",
    }, 200);
  }
}

export {
  createSnapMidtrans,
  handleMidtransWebhook,
  snap,
  verifyMidtransSignature,
};

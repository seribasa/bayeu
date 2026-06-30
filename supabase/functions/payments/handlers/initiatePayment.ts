import { Context } from "hono";
import { paymentSupabaseAdmin } from "../../_shared/paymentSupabase.ts";
import { getAuthToken } from "../../_shared/jwtHelper.ts";
import { createStripeIntent } from "../gateways/stripe.ts";
import { createSnapMidtrans } from "../gateways/midtrans.ts";

async function rollbackOrder(orderId: string, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await paymentSupabaseAdmin.from("orders").delete().eq("order_id", orderId);
      console.log(`Order ${orderId} successfully rolled back.`);
      return;
    } catch (error) {
      console.error(`Rollback attempt ${attempt} failed:`, error);
      if (attempt === maxRetries) {
        console.error(`Max rollback retries reached for order ${orderId}.`);
        throw error;
      }
    }
  }
}

// deno-lint-ignore no-explicit-any
function validateBody(body: any): string | null {
  if (!body) return "Invalid request body";
  if (typeof body !== "object") return "Request body must be an object";
  if (!body.gateway) return "Payment gateway is required";
  if (body.gateway !== "stripe" && body.gateway !== "midtrans") return "Payment gateway not supported yet";
  if (body.gateway == "stripe" && !body.currency) return "Currency is required";
  if (!body.amount) return "Amount is required";
  if (!body.tenant_id) return "Tenant ID is required";
  return null;
}

export async function handleInitiatePayment(c: Context) {
  try {
    const authHeader = c.req.header("Authorization");
    if (!authHeader) {
      return c.json({ is_successful: false, message: "Missing authorization header" }, 401);
    }
    const token = getAuthToken(authHeader);

    // Validate the token to get the user ID
    let userId: string;
    let name: string = "Customer";
    let email: string = "";
    
    try {
      // Just decode the token, don't verify against DB since it's from a tenant
      const base64Url = token.split(".")[1];
      const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
      const jsonPayload = decodeURIComponent(atob(base64).split("").map(function(c) {
          return "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2);
      }).join(""));
      const decoded = JSON.parse(jsonPayload);
      userId = decoded.sub;
      email = decoded.email || "";
      name = decoded.user_metadata?.full_name || "Customer";
    } catch (e) {
      console.error("JWT Decode error:", e);
      return c.json({ is_successful: false, message: "Unauthorized: Invalid token format" }, 401);
    }

    const body = await c.req.json();
    const errorMessageBodyRequest = validateBody(body);

    if (errorMessageBodyRequest) {
      return c.json({ is_successful: false, message: errorMessageBodyRequest }, 400);
    }

    const { gateway, amount, tenant_id, metadata } = body;
    const currency = gateway === "midtrans" ? "idr" : body.currency;

    const { data: orderData, error: orderError } = await paymentSupabaseAdmin
      .from("orders")
      .insert({
        user_id: userId,
        total_amount: amount,
        status: "none",
        gateway: gateway,
        metadata: {
          ...metadata,
          tenant_id,
        },
      })
      .select("order_id")
      .single();

    if (orderError) {
      console.error(orderError);
      return c.json({ is_successful: false, message: "Failed to create order" }, 500);
    }

    const orderId = orderData.order_id;
    let response;

    if (gateway === "stripe") {
      try {
        response = await createStripeIntent({
          orderId,
          amount,
          currency,
          customerId: userId,
        });
      } catch (error) {
        await rollbackOrder(orderId);
        console.error("Stripe error:", error);
        throw error;
      }
    } else if (gateway === "midtrans") {
      try {
        response = await createSnapMidtrans({
          orderId,
          totalAmount: amount,
          customerName: name,
          customerEmail: email,
        });
      } catch (error) {
        await rollbackOrder(orderId);
        console.error("Midtrans error:", error);
        throw error;
      }
    }

    // update order "gateway_response"
    const { error: updateOrderError } = await paymentSupabaseAdmin
      .from("orders")
      .update({
        gateway_response: response,
        updated_at: new Date(),
      })
      .eq("order_id", orderId);

    if (updateOrderError) {
      await rollbackOrder(orderId);
      return c.json({ is_successful: false, message: "Failed to update order with gateway response" }, 500);
    }

    return c.json({
      is_successful: true,
      data: response,
    });
  } catch (error) {
    console.error("Initiate Payment Error:", error);
    return c.json({ is_successful: false, message: "Internal Server Error" }, 500);
  }
}

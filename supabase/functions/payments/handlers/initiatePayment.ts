import { Context } from "hono";
import { paymentSupabaseAdmin } from "../../_shared/paymentSupabase.ts";
import { getAuthToken } from "../../_shared/jwtHelper.ts";
import { createStripeCheckout } from "../gateways/stripe.ts";
import { createSnapMidtrans } from "../gateways/midtrans.ts";

async function rollbackOrder(orderId: string, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const { error } = await paymentSupabaseAdmin
        .from("orders")
        .delete()
        .eq("order_id", orderId);

      if (error) {
        throw error;
      }

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
  if (typeof body.amount !== "number" || body.amount <= 0) return "Amount must be a positive number";
  if (!body.tenant_id) return "Tenant ID is required";
  return null;
}

export async function handleInitiatePayment(c: Context) {
  try {
    const authHeader = c.req.header("Authorization") || c.req.header("apikey");
    if (!authHeader) {
      return c.json({ is_successful: false, message: "Missing authorization header" }, 401);
    }
    const body = await c.req.json();
    const errorMessageBodyRequest = validateBody(body);

    if (errorMessageBodyRequest) {
      return c.json({ is_successful: false, message: errorMessageBodyRequest }, 400);
    }

    const { gateway, amount, tenant_id, metadata, customer_email, customer_name } = body;
    const currency = gateway === "midtrans" ? "idr" : body.currency;
    const expiryMinutes = parseInt(Deno.env.get("PAYMENT_EXPIRY_MINUTES") || "1440", 10);

    let userId: string = body.user_id || body.customer_id;
    let email: string = customer_email || body.email || "";
    let name: string = customer_name || body.name || "Customer";

    if (!userId && authHeader) {
      try {
        const token = getAuthToken(authHeader);
        const base64Url = token.split(".")[1];
        if (base64Url) {
          const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
          const jsonPayload = decodeURIComponent(atob(base64).split("").map(function(c) {
              return "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2);
          }).join(""));
          const decoded = JSON.parse(jsonPayload);
          userId = decoded.sub;
          email = email || decoded.email || "";
          name = name || decoded.user_metadata?.full_name || "Customer";
        }
      } catch (e) {
        console.error("JWT Decode fallback error:", e);
      }
    }

    if (!userId) {
      return c.json({
        is_successful: false,
        message: "Missing required parameter: user_id or customer_id",
      }, 400);
    }

    // Fetch tenant configuration from tenants database table
    const { data: tenantConfig } = await paymentSupabaseAdmin
      .from("tenants")
      .select("default_success_url, default_failed_url, default_cancel_url, webhook_url")
      .eq("tenant_id", tenant_id)
      .maybeSingle();

    const effectiveWebhookUrl = tenantConfig?.webhook_url;
    if (effectiveWebhookUrl) {
      try {
        const { upsertOutpostDestination } = await import("../helpers/outpost.ts");
        await upsertOutpostDestination(tenant_id, effectiveWebhookUrl);
      } catch (e) {
        console.error("Failed to upsert destination:", e);
      }
    }

    // Check for existing pending order for this tenant and invoice
    if (metadata?.invoice_id) {
      const { data: existingOrders, error: findError } = await paymentSupabaseAdmin
        .from("orders")
        .select("order_id, gateway, gateway_response, created_at, status, metadata")
        .eq("user_id", userId)
        .eq("gateway", gateway)
        .eq("metadata->>invoice_id", String(metadata.invoice_id))
        .eq("metadata->>tenant_id", String(tenant_id))
        .not("status::text", "in", "(paid,cancelled,failed,refunded,expire)");

      if (findError) {
        console.error("Error searching existing orders:", findError);
      }

      if (existingOrders && existingOrders.length > 0) {
        // deno-lint-ignore no-explicit-any
        const matchingOrder = existingOrders.find((o: any) =>
          o.gateway_response &&
          o.gateway_response.token
        );

        if (matchingOrder) {
          const createdAt = new Date(matchingOrder.created_at).getTime();
          const isUnexpired = (createdAt + expiryMinutes * 60 * 1000) > Date.now();

          if (isUnexpired) {
            return c.json({
              is_successful: true,
              data: {
                order_id: matchingOrder.order_id,
                gateway: matchingOrder.gateway,
                token: matchingOrder.gateway_response.token,
                redirect_url: matchingOrder.gateway_response.redirect_url,
              },
            });
          } else {
            // Mark expired order
            await paymentSupabaseAdmin
              .from("orders")
              .update({ status: "expire", updated_at: new Date() })
              .eq("order_id", matchingOrder.order_id);
          }
        }
      }
    }

    const defaultSuccess = tenantConfig?.default_success_url || Deno.env.get("DEFAULT_SUCCESS_URL");
    const defaultFailed = tenantConfig?.default_failed_url || Deno.env.get("DEFAULT_FAILED_URL");
    const defaultCancel = tenantConfig?.default_cancel_url || Deno.env.get("DEFAULT_CANCEL_URL");

    const isSameOrigin = (customUrl?: string, allowedUrl?: string): boolean => {
      if (!customUrl) return false;
      if (!allowedUrl) return true;
      try {
        const custom = new URL(customUrl);
        const allowed = new URL(allowedUrl);
        return custom.hostname === allowed.hostname;
      } catch {
        return false;
      }
    };

    const resolvedSuccessUrl = isSameOrigin(body.success_url, defaultSuccess)
      ? body.success_url!
      : defaultSuccess;

    const resolvedFailedUrl = isSameOrigin(body.failed_url, defaultFailed)
      ? body.failed_url!
      : defaultFailed;

    const customCancel = body.cancel_url || body.back_url;
    const resolvedCancelUrl = isSameOrigin(customCancel, defaultCancel)
      ? customCancel!
      : defaultCancel;

    if (!resolvedSuccessUrl) {
      return c.json({ is_successful: false, message: "Missing required redirect URL: success_url" }, 400);
    }
    if (!resolvedFailedUrl) {
      return c.json({ is_successful: false, message: "Missing required redirect URL: failed_url" }, 400);
    }
    if (!resolvedCancelUrl) {
      return c.json({ is_successful: false, message: "Missing required redirect URL: cancel_url" }, 400);
    }

    const { data: orderData, error: orderError } = await paymentSupabaseAdmin
      .from("orders")
      .insert({
        user_id: userId,
        total_amount: amount,
        currency: currency,
        status: "draft",
        gateway: gateway,
        metadata: {
          ...metadata,
          tenant_id,
          success_url: resolvedSuccessUrl,
          failed_url: resolvedFailedUrl,
          cancel_url: resolvedCancelUrl,
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
        response = await createStripeCheckout({
          orderId,
          amount,
          currency,
          expiryMinutes,
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
          expiryMinutes,
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
      data: {
        order_id: orderId,
        gateway: gateway,
        token: response?.token,
        redirect_url: response?.redirect_url,
      },
    });
  } catch (error) {
    console.error("Initiate Payment Error:", error);
    return c.json({ is_successful: false, message: "Internal Server Error" }, 500);
  }
}

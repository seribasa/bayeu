import { Context } from "hono";
import { paymentSupabaseAdmin } from "../../_shared/paymentSupabase.ts";
import { getAuthToken } from "../../_shared/jwtHelper.ts";
import { paymentGateways } from "../gateways/paymentFactory.ts";

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

import { z } from "zod";

export const initiatePaymentSchema = z
  .object({
    gateway: z.string({ required_error: "Payment gateway is required" }).min(
      1,
      "Payment gateway is required",
    ),
    currency: z.string().optional(),
    amount: z
      .number({
        required_error: "Amount is required",
        invalid_type_error: "Amount must be a positive number",
      })
      .positive("Amount must be a positive number"),
    tenant_id: z.string({ required_error: "Tenant ID is required" }).min(
      1,
      "Tenant ID is required",
    ),
    metadata: z.record(z.unknown()).optional(),
    customer_email: z.string().email("Invalid email format").optional(),
    customer_name: z.string().optional(),
    user_id: z.string().optional(),
    customer_id: z.string().optional(),
    email: z.string().email("Invalid email format").optional(),
    name: z.string().optional(),
    success_url: z.string().optional(),
    return_url: z.string().optional(),
    failed_url: z.string().optional(),
    error_url: z.string().optional(),
    cancel_url: z.string().optional(),
    back_url: z.string().optional(),
  })
  .refine(
    (data) => {
      // Validate gateway against supported ones
      return !!paymentGateways[data.gateway as keyof typeof paymentGateways];
    },
    { message: "Payment gateway not supported yet", path: ["gateway"] },
  )
  .refine(
    (data) => {
      if (data.gateway === "stripe" && !data.currency) return false;
      return true;
    },
    { message: "Currency is required", path: ["currency"] },
  );

export async function handleInitiatePayment(c: Context) {
  try {
    const authHeader = c.req.header("Authorization") || c.req.header("apikey");
    if (!authHeader) {
      return c.json({
        is_successful: false,
        message: "Missing authorization header",
      }, 401);
    }
    const rawBody = await c.req.json();
    const parsedBody = initiatePaymentSchema.safeParse(rawBody);

    if (!parsedBody.success) {
      const firstError = parsedBody.error.errors[0];
      return c.json(
        { is_successful: false, message: firstError.message },
        400,
      );
    }

    const body = parsedBody.data;

    const {
      gateway,
      amount,
      tenant_id,
      metadata,
      customer_email,
      customer_name,
    } = body;
    const currency = gateway === "midtrans" ? "idr" : (body.currency || "usd");
    const expiryMinutes = parseInt(
      Deno.env.get("PAYMENT_EXPIRY_MINUTES") || "1440",
      10,
    );

    let userId: string = body.user_id || body.customer_id || "";
    let email: string = customer_email || body.email || "";
    let name: string = customer_name || body.name || "Customer";

    if (!userId && authHeader) {
      try {
        const token = getAuthToken(authHeader);
        const base64Url = token.split(".")[1];
        if (base64Url) {
          const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
          const jsonPayload = decodeURIComponent(
            atob(base64).split("").map(function (c) {
              return "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2);
            }).join(""),
          );
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
      .select(
        "default_success_url, default_failed_url, default_cancel_url, webhook_url",
      )
      .eq("tenant_id", tenant_id)
      .maybeSingle();

    const effectiveWebhookUrl = tenantConfig?.webhook_url;
    if (effectiveWebhookUrl) {
      try {
        const { upsertOutpostDestination } = await import(
          "../helpers/outpost.ts"
        );
        await upsertOutpostDestination(tenant_id, effectiveWebhookUrl);
      } catch (e) {
        console.error("Failed to upsert destination:", e);
      }
    }

    // Check for existing orders for this tenant and invoice
    if (metadata?.invoice_id) {
      const { data: allExistingOrders, error: findError } =
        await paymentSupabaseAdmin
          .from("orders")
          .select(
            "order_id, gateway, gateway_response, created_at, status, metadata",
          )
          .eq("user_id", userId)
          .eq("metadata->>invoice_id", String(metadata.invoice_id))
          .eq("metadata->>tenant_id", String(tenant_id));

      if (findError) {
        console.error("Error searching existing orders:", findError);
      }

      if (allExistingOrders && allExistingOrders.length > 0) {
        type OrderRecord = {
          order_id: string;
          status: string;
          gateway: string;
          created_at: string;
          gateway_response: Record<string, string>;
        };

        // Check if the invoice is already paid across any gateway
        const paidOrder = allExistingOrders.find((o: OrderRecord) =>
          o.status === "paid"
        );
        if (paidOrder) {
          return c.json({
            is_successful: false,
            message: "This invoice has already been paid.",
            data: {
              order_id: paidOrder.order_id,
              status: paidOrder.status,
            },
          }, 400);
        }

        // Filter for pending orders matching the requested gateway
        const pendingOrders = allExistingOrders.filter((o: OrderRecord) =>
          !["paid", "cancelled", "failed", "refunded", "expire"].includes(
            o.status,
          ) &&
          o.gateway === gateway
        );

        const matchingOrder = pendingOrders.find((o: OrderRecord) =>
          o.gateway_response &&
          o.gateway_response.token
        );

        if (matchingOrder) {
          const createdAt = new Date(matchingOrder.created_at).getTime();
          const isUnexpired =
            (createdAt + expiryMinutes * 60 * 1000) > Date.now();

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

    const defaultSuccess = tenantConfig?.default_success_url ||
      Deno.env.get("DEFAULT_SUCCESS_URL");
    const defaultFailed = tenantConfig?.default_failed_url ||
      Deno.env.get("DEFAULT_FAILED_URL");
    const defaultCancel = tenantConfig?.default_cancel_url ||
      Deno.env.get("DEFAULT_CANCEL_URL");

    const isSameOrigin = (customUrl?: string, allowedUrl?: string): boolean => {
      if (!customUrl) return false;
      if (
        (Deno.env.get("ALLOWED_ORIGINS") || "").split(",").some((origin) =>
          origin.trim().toLowerCase().includes("localhost")
        )
      ) {
        return true;
      }
      if (!allowedUrl) return true;

      try {
        return new URL(customUrl).hostname === new URL(allowedUrl).hostname;
      } catch {
        return false;
      }
    };

    const resolveRedirectUrl = (
      customUrl: string | undefined,
      defaultUrl: string | undefined,
      field: "success_url" | "failed_url" | "cancel_url",
    ) => {
      const resolvedUrl = isSameOrigin(customUrl, defaultUrl)
        ? customUrl
        : defaultUrl;

      if (!resolvedUrl) {
        return {
          error: `Missing required redirect URL: ${field}`,
        };
      }

      return { value: resolvedUrl };
    };

    const successUrl = resolveRedirectUrl(
      body.success_url || body.return_url,
      defaultSuccess,
      "success_url",
    );
    if ("error" in successUrl) {
      return c.json({ is_successful: false, message: successUrl.error }, 400);
    }

    const failedUrl = resolveRedirectUrl(
      body.failed_url || body.error_url,
      defaultFailed,
      "failed_url",
    );
    if ("error" in failedUrl) {
      return c.json({ is_successful: false, message: failedUrl.error }, 400);
    }

    const cancelUrl = resolveRedirectUrl(
      body.cancel_url || body.back_url,
      defaultCancel,
      "cancel_url",
    );
    if ("error" in cancelUrl) {
      return c.json({ is_successful: false, message: cancelUrl.error }, 400);
    }

    const resolvedSuccessUrl = successUrl.value;
    const resolvedFailedUrl = failedUrl.value;
    const resolvedCancelUrl = cancelUrl.value;

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
      return c.json(
        { is_successful: false, message: "Failed to create order" },
        500,
      );
    }

    const orderId = orderData.order_id;
    let response;

    const gatewayService = paymentGateways[gateway];
    if (!gatewayService) {
      await rollbackOrder(orderId);
      return c.json(
        { is_successful: false, message: "Unsupported gateway" },
        400,
      );
    }

    try {
      response = await gatewayService.createTransaction({
        orderId,
        amount,
        currency,
        expiryMinutes,
        customerName: name,
        customerEmail: email,
      });
    } catch (error) {
      await rollbackOrder(orderId);
      console.error(`${gateway} error:`, error);
      throw error;
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
      return c.json({
        is_successful: false,
        message: "Failed to update order with gateway response",
      }, 500);
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
    return c.json(
      { is_successful: false, message: "Internal Server Error" },
      500,
    );
  }
}

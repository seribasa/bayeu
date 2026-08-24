import { Context } from "hono";
import { paymentSupabaseAdmin } from "../../_shared/paymentSupabase.ts";
import { publishEvent } from "../helpers/outpost.ts";

export async function handlePaymentRedirect(c: Context) {
  try {
    const orderId = c.req.query("order_id");
    const event = c.req.query("event") || c.req.query("status") || "success";

    if (!orderId) {
      return c.text("Missing order_id parameter", 400);
    }

    const { data: order, error } = await paymentSupabaseAdmin
      .from("orders")
      .select("order_id, status, metadata")
      .eq("order_id", orderId)
      .single();

    if (error || !order) {
      console.error(`Order ${orderId} not found for redirect:`, error);
      return c.text("Order not found", 404);
    }

    const metadata = order.metadata || {};
    let targetUrl: string | undefined;

    await publishEvent({
      tenantId: metadata.tenant_id,
      event: `redirect.${event}`,
      payload: metadata,
    });

    if (event === "cancel") {
      targetUrl = metadata.cancel_url || metadata.back_url;
    } else if (event === "failed" || event === "error") {
      targetUrl = metadata.failed_url;
    } else {
      targetUrl = metadata.success_url;
    }

    if (!targetUrl) {
      targetUrl = metadata.success_url || metadata.cancel_url ||
        metadata.failed_url || "/";
    }

    const safeTargetUrl = targetUrl || "/";
    if (
      !safeTargetUrl.startsWith("http://") &&
      !safeTargetUrl.startsWith("https://") && !safeTargetUrl.startsWith("/")
    ) {
      return c.text("Invalid redirect URL scheme", 400);
    }
    let finalUrl: string;
    try {
      const parsedUrl = new URL(safeTargetUrl);
      if (!parsedUrl.searchParams.has("invoice_id") && metadata.invoice_id) {
        parsedUrl.searchParams.set("invoice_id", metadata.invoice_id);
      }
      if (!parsedUrl.searchParams.has("order_id")) {
        parsedUrl.searchParams.set("order_id", orderId);
      }
      if (!parsedUrl.searchParams.has("status")) {
        parsedUrl.searchParams.set("status", event);
      }
      finalUrl = parsedUrl.toString();
    } catch (_e) {
      const delimiter = safeTargetUrl.includes("?") ? "&" : "?";
      finalUrl = `${safeTargetUrl}${delimiter}`;
      if (metadata.invoice_id) {
        finalUrl += `invoice_id=${encodeURIComponent(metadata.invoice_id)}&`;
      }
      finalUrl += `order_id=${encodeURIComponent(orderId)}&status=${
        encodeURIComponent(event)
      }`;
    }

    return c.redirect(finalUrl, 302);
  } catch (err) {
    console.error("Error handling payment redirect:", err);
    return c.text("Internal server error during redirect", 500);
  }
}

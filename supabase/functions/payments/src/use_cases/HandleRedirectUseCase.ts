import { IOrderRepository } from "../domain/repositories/interfaces.ts";
import { IOutpostService } from "../domain/services/interfaces.ts";

export class HandleRedirectUseCase {
  constructor(
    private orderRepo: IOrderRepository,
    private outpostService: IOutpostService,
  ) {}

  async execute(
    orderId: string,
    event: string,
  ): Promise<{ url: string } | { error: string; status: number }> {
    try {
      const order = await this.orderRepo.findById(orderId);
      if (!order) {
        return { error: "Order not found", status: 404 };
      }

      const metadata = order.metadata || {};

      try {
        await this.outpostService.publishEvent({
          tenantId: metadata.tenant_id as string,
          event: `redirect.${event}`,
          payload: metadata,
        });
      } catch (e) {
        console.error("Failed to publish", e);
      }

      let targetUrl: string | undefined;

      if (event === "cancel") {
        targetUrl = (metadata.cancel_url as string) ||
          (metadata.back_url as string);
      } else if (event === "failed" || event === "error") {
        targetUrl = metadata.failed_url as string;
      } else {
        targetUrl = metadata.success_url as string;
      }

      if (!targetUrl) {
        targetUrl = (metadata.success_url as string) ||
          (metadata.cancel_url as string) || (metadata.failed_url as string) ||
          "/";
      }

      const safeTargetUrl = targetUrl || "/";
      if (
        !safeTargetUrl.startsWith("http://") &&
        !safeTargetUrl.startsWith("https://") && !safeTargetUrl.startsWith("/")
      ) {
        return { error: "Invalid redirect URL scheme", status: 400 };
      }

      let finalUrl: string;
      try {
        const parsedUrl = new URL(safeTargetUrl);
        if (!parsedUrl.searchParams.has("invoice_id") && metadata.invoice_id) {
          parsedUrl.searchParams.set("invoice_id", String(metadata.invoice_id));
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
          finalUrl += `invoice_id=${
            encodeURIComponent(String(metadata.invoice_id))
          }&`;
        }
        finalUrl += `order_id=${encodeURIComponent(orderId)}&status=${
          encodeURIComponent(event)
        }`;
      }

      return { url: finalUrl };
    } catch (err) {
      console.error("Error handling payment redirect:", err);
      return { error: "Internal server error during redirect", status: 500 };
    }
  }
}

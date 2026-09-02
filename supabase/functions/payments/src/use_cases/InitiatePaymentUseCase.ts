import {
  IOrderRepository,
  ITenantRepository,
} from "../domain/repositories/interfaces.ts";
import { IGatewayFactory } from "../domain/gateways/interfaces.ts";
import { IOutpostService } from "../domain/services/interfaces.ts";
import { PaymentResponse } from "../presentation/dtos/payment.dto.ts";

export interface InitiatePaymentRequest {
  gateway: string;
  amount: number;
  currency?: string;
  tenant_id: string;
  metadata?: Record<string, unknown>;
  customer_email?: string;
  customer_name?: string;
  user_id?: string;
  customer_id?: string;
  email?: string;
  name?: string;
  success_url?: string;
  return_url?: string;
  failed_url?: string;
  error_url?: string;
  cancel_url?: string;
  back_url?: string;
}

export class InitiatePaymentUseCase {
  constructor(
    private orderRepo: IOrderRepository,
    private tenantRepo: ITenantRepository,
    private gatewayFactory: IGatewayFactory,
    private outpostService: IOutpostService,
  ) {}

  async execute(
    request: InitiatePaymentRequest,
    decodedUserId: string,
    decodedEmail: string,
    decodedName: string,
  ): Promise<PaymentResponse> {
    const gateway = request.gateway;
    const amount = request.amount;
    const tenantId = request.tenant_id;
    const metadata = request.metadata;
    const currency = gateway === "midtrans"
      ? "idr"
      : (request.currency || "usd");
    const expiryMinutes = parseInt(
      Deno.env.get("PAYMENT_EXPIRY_MINUTES") || "1440",
      10,
    );

    const userId = request.user_id || request.customer_id || decodedUserId;
    const email = request.customer_email || request.email || decodedEmail;
    const name = request.customer_name || request.name || decodedName ||
      "Customer";

    if (!userId) {
      throw new Error("Missing required parameter: user_id or customer_id");
    }

    const tenantConfig = await this.tenantRepo.findById(tenantId);
    const effectiveWebhookUrl = tenantConfig?.webhook_url;

    if (effectiveWebhookUrl) {
      try {
        await this.outpostService.upsertDestination(
          tenantId,
          effectiveWebhookUrl,
        );
      } catch (e) {
        console.error("Failed to upsert destination:", e);
      }
    }

    if (metadata?.invoice_id) {
      const invoiceId = String(metadata.invoice_id);

      const paidOrder = await this.orderRepo.findPaidOrderByInvoice(
        userId,
        tenantId,
        invoiceId,
      );
      if (paidOrder) {
        return {
          is_successful: false,
          message: "This invoice has already been paid.",
          data: { order_id: paidOrder.order_id, status: paidOrder.status },
        };
      }

      const pendingOrders = await this.orderRepo.findPendingOrdersByInvoice(
        userId,
        tenantId,
        invoiceId,
      );
      const matchingOrder = pendingOrders.find((o) =>
        o.gateway === gateway && o.gateway_response?.token
      );

      if (matchingOrder) {
        const createdAt = matchingOrder.created_at
          ? new Date(matchingOrder.created_at).getTime()
          : Date.now();
        const isUnexpired =
          (createdAt + expiryMinutes * 60 * 1000) > Date.now();

        if (isUnexpired) {
          return {
            is_successful: true,
            data: {
              order_id: matchingOrder.order_id,
              gateway: matchingOrder.gateway,
              token: matchingOrder.gateway_response?.token,
              redirect_url: matchingOrder.gateway_response?.redirect_url,
            },
          };
        } else {
          await this.orderRepo.updateOrder(matchingOrder.order_id, {
            status: "expire",
          });
        }
      }
    }

    const resolveRedirectUrl = (
      customUrl?: string,
      defaultUrl?: string,
      field?: string,
    ) => {

      const isSameOrigin = (cUrl?: string, aUrl?: string): boolean => {
        if (!cUrl) return false;
        
        try {
          const customOrigin = new URL(cUrl).origin;
          const customHostname = new URL(cUrl).hostname;
          
          if (aUrl) {
            const defaultHostname = new URL(aUrl).hostname;
            if (customHostname === defaultHostname) return true;
          } else {
            return true;
          }

          const allowedOrigins = Deno.env.get("ALLOWED_ORIGINS")?.split(",").map((o) => o.trim()) || [];
          if (allowedOrigins.includes(customOrigin) || allowedOrigins.includes("*")) {
            return true;
          }
          
          // Legacy behavior check for localhost if they just put "localhost" in ALLOWED_ORIGINS
          if (allowedOrigins.some(o => o.toLowerCase().includes("localhost")) && customHostname === "localhost") {
            return true;
          }

          return false;
        } catch {
          return false;
        }
      };

      const resolvedUrl = isSameOrigin(customUrl, defaultUrl)
        ? customUrl
        : defaultUrl;
      if (!resolvedUrl) {
        throw new Error(`Missing required redirect URL: ${field}`);
      }
      return resolvedUrl;
    };

    let resolvedSuccessUrl, resolvedFailedUrl, resolvedCancelUrl;
    try {
      resolvedSuccessUrl = resolveRedirectUrl(
        request.success_url || request.return_url,
        tenantConfig?.default_success_url ||
          Deno.env.get("DEFAULT_SUCCESS_URL"),
        "success_url",
      );
      resolvedFailedUrl = resolveRedirectUrl(
        request.failed_url || request.error_url,
        tenantConfig?.default_failed_url || Deno.env.get("DEFAULT_FAILED_URL"),
        "failed_url",
      );
      resolvedCancelUrl = resolveRedirectUrl(
        request.cancel_url || request.back_url,
        tenantConfig?.default_cancel_url || Deno.env.get("DEFAULT_CANCEL_URL"),
        "cancel_url",
      );
    } catch (e: unknown) {
      return {
        is_successful: false,
        message: e instanceof Error ? e.message : "Unknown error",
      };
    }

    const orderData = await this.orderRepo.createOrder({
      user_id: userId,
      total_amount: amount,
      currency: currency,
      status: "draft",
      gateway: gateway,
      metadata: {
        ...metadata,
        tenant_id: tenantId,
        success_url: resolvedSuccessUrl,
        failed_url: resolvedFailedUrl,
        cancel_url: resolvedCancelUrl,
      },
    });

    const gatewayService = this.gatewayFactory.getGateway(gateway);
    if (!gatewayService) {
      await this.rollbackOrder(orderData.order_id);
      return { is_successful: false, message: "Unsupported gateway" };
    }

    let response;
    try {
      response = await gatewayService.createTransaction({
        orderId: orderData.order_id,
        amount,
        currency,
        expiryMinutes,
        customerName: name,
        customerEmail: email,
      });
    } catch (error) {
      await this.rollbackOrder(orderData.order_id);
      throw error;
    }

    try {
      await this.orderRepo.updateOrder(orderData.order_id, {
        gateway_response: response,
      });
    } catch (_updateOrderError) {
      await this.rollbackOrder(orderData.order_id);
      return {
        is_successful: false,
        message: "Failed to update order with gateway response",
      };
    }

    return {
      is_successful: true,
      data: {
        order_id: orderData.order_id,
        gateway: gateway,
        token: response?.token,
        redirect_url: response?.redirect_url,
      },
    };
  }

  private async rollbackOrder(orderId: string, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.orderRepo.deleteOrder(orderId);
        return;
      } catch (error) {
        if (attempt === maxRetries) throw error;
      }
    }
  }
}

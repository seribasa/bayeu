import { Context } from "hono";
import { IGatewayFactory } from "../../domain/gateways/interfaces.ts";

export class WebhookController {
  constructor(private gatewayFactory: IGatewayFactory) {}

  handleWebhook = async (c: Context) => {
    try {
      const paymentGateway = c.req.param("payment_gateway");

      if (!paymentGateway) {
        return c.json(
          {
            is_successful: false,
            message: "Payment gateway not specified",
          },
          400,
        );
      }

      // We bypass full clean architecture abstraction here because webhooks inherently rely on HTTP-specific things
      // like request bodies and headers to verify signatures, especially for Stripe and Midtrans.
      // In a strict clean architecture, we would have a WebhookUseCase that receives raw body and headers.
      // But to avoid rewriting the legacy gateways, we adapter pattern it by passing context.
      const gatewayService = this.gatewayFactory.getGateway(
        paymentGateway,
      ) as unknown as { handleWebhook: (c: Context) => Promise<Response> };

      if (!gatewayService || !gatewayService.handleWebhook) {
        // Fallback to legacy paymentFactory if adapter doesn't expose it
        const { paymentGateways } = await import(
          "../../../gateways/paymentFactory.ts"
        );
        const legacy =
          paymentGateways[paymentGateway as keyof typeof paymentGateways];
        if (!legacy) {
          return c.json({
            is_successful: false,
            message: "Unsupported gateway",
          }, 400);
        }
        return await legacy.handleWebhook(c);
      }

      return await gatewayService.handleWebhook(c);
    } catch (error) {
      console.error("Error processing webhook:", error);
      return c.json(
        { is_successful: false, message: "Internal server error" },
        500,
      );
    }
  };
}

import { Context } from "hono";
import { paymentGateways } from "../gateways/paymentFactory.ts";

export const handleWebhook = async (c: Context) => {
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

    const gatewayService = paymentGateways[paymentGateway];
    if (!gatewayService) {
      return c.json(
        { is_successful: false, message: "Unsupported gateway" },
        400,
      );
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

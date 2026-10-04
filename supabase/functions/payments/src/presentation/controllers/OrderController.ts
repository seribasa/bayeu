import { Context } from "hono";
import { IAuthService } from "../../domain/services/interfaces.ts";
import { InitiateItemizedPaymentUseCase } from "../../use_cases/InitiateItemizedPaymentUseCase.ts";
import { GetOrderUseCase } from "../../use_cases/GetOrderUseCase.ts";
import { HandleRedirectUseCase } from "../../use_cases/HandleRedirectUseCase.ts";

export class OrderController {
  constructor(
    private authService: IAuthService,
    private initiateItemizedPaymentUseCase: InitiateItemizedPaymentUseCase,
    private getOrderUseCase: GetOrderUseCase,
    private handleRedirectUseCase: HandleRedirectUseCase,
  ) {}

  handleInitiate = async (c: Context) => {
    try {
      const body = await c.req.json();
      if (!body || typeof body !== "object") {
        return c.json({
          is_successful: false,
          message: "Request body must be an object",
        }, 400);
      }
      if (!body.gateway) {
        return c.json({
          is_successful: false,
          message: "Payment gateway is required",
        }, 400);
      }
      if (body.gateway !== "stripe" && body.gateway !== "midtrans") {
        return c.json({
          is_successful: false,
          message: "Payment gateway not supported yet",
        }, 400);
      }
      if (body.gateway === "stripe" && !body.currency) {
        return c.json(
          { is_successful: false, message: "Currency is required" },
          400,
        );
      }
      if (!body.items || !Array.isArray(body.items)) {
        return c.json({
          is_successful: false,
          message: "Items must be an array",
        }, 400);
      }
      if (body.items.length === 0) {
        return c.json({
          is_successful: false,
          message: "Items array cannot be empty",
        }, 400);
      }

      const authHeader = c.req.header("Authorization");
      if (!authHeader) {
        return c.json({ is_successful: false, message: "Unauthorized" }, 401);
      }

      const user = await this.authService.verifyUser(authHeader);
      if (!user) {
        return c.json({ is_successful: false, message: "Unauthorized" }, 401);
      }

      const result = await this.initiateItemizedPaymentUseCase.execute(
        body,
        user.userId,
        user.email,
        user.name,
      );

      if (!result.is_successful) {
        return c.json(result, 400);
      }
      return c.json(result);
    } catch (error) {
      console.error(error);
      return c.json({
        is_successful: false,
        message:
          "Sorry, we are unable to process your payment at this time. Please try again later.",
      }, 500);
    }
  };

  handleOrderStatus = async (c: Context) => {
    try {
      const orderId = c.req.param("order_id");
      const authHeader = c.req.header("Authorization");

      if (!authHeader) {
        return c.json({ is_successful: false, message: "Unauthorized" }, 401);
      }

      const user = await this.authService.verifyUser(authHeader);
      if (!user) {
        return c.json({ is_successful: false, message: "Unauthorized" }, 401);
      }

      const result = await this.getOrderUseCase.execute(orderId, user.userId);
      const status = result.status || 200;

      // Remove status before returning to match original behavior
      delete result.status;

      return c.json(
        result,
        status as unknown as 200 | 400 | 401 | 403 | 404 | 500,
      );
    } catch (_e) {
      return c.json(
        { is_successful: false, message: "Internal server error" },
        500,
      );
    }
  };

  handlePaymentRedirect = async (c: Context) => {
    try {
      const orderId = c.req.query("order_id");
      const event = c.req.query("event") || c.req.query("status") || "success";

      if (!orderId) {
        return c.text("Missing order_id parameter", 400);
      }

      const result = await this.handleRedirectUseCase.execute(orderId, event);

      if ("error" in result) {
        return c.text(
          result.error,
          result.status as unknown as 200 | 400 | 401 | 403 | 404 | 500,
        );
      }

      return c.redirect(result.url, 302);
    } catch (err) {
      console.error("Error handling payment redirect:", err);
      return c.text("Internal server error during redirect", 500);
    }
  };
}

import { Context } from "hono";
import { InitiatePaymentUseCase } from "../../use_cases/InitiatePaymentUseCase.ts";
import { initiatePaymentSchema } from "../dtos/payment.dto.ts";
import { IAuthService } from "../../domain/services/interfaces.ts";

export class PaymentController {
  constructor(
    private initiatePaymentUseCase: InitiatePaymentUseCase,
    private authService: IAuthService,
  ) {}

  handleInitiatePayment = async (c: Context) => {
    try {
      const authHeader = c.req.header("Authorization") ||
        c.req.header("apikey");
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
        const detailsError = parsedBody.error.format();
        return c.json({
          is_successful: false,
          message: firstError.message,
          details: detailsError,
        }, 400);
      }

      const user = this.authService.extractUserFromHeader(authHeader);

      const result = await this.initiatePaymentUseCase.execute(
        parsedBody.data,
        user?.userId || "",
        user?.email || "",
        user?.name || "",
      );

      if (!result.is_successful) {
        return c.json(result, 400);
      }
      return c.json(result);
    } catch (error) {
      console.error("PaymentController Error:", error);
      return c.json(
        { is_successful: false, message: "Internal Server Error" },
        500,
      );
    }
  };
}

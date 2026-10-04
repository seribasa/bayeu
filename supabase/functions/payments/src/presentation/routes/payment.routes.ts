import { Hono } from "hono";
import {
  orderController,
  paymentController,
  transactionController,
  webhookController,
} from "../../di/container.ts";
import { paymentCorsMiddleware } from "../middlewares/cors.ts";

export const paymentRoutes = new Hono();

paymentRoutes.post("/initiate", orderController.handleInitiate);
paymentRoutes.post(
  "/initiate-payment",
  paymentCorsMiddleware(),
  paymentController.handleInitiatePayment,
);
paymentRoutes.get("/redirect", orderController.handlePaymentRedirect);
paymentRoutes.get("/payments/redirect", orderController.handlePaymentRedirect);
paymentRoutes.get("/order/:order_id", orderController.handleOrderStatus);
paymentRoutes.get(
  "/transaction/:transaction_id",
  transactionController.handleTransaction,
);
paymentRoutes.post(
  "/webhook/:payment_gateway",
  webhookController.handleWebhook,
);

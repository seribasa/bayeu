import { Hono } from "hono";
import { handleInitiate } from "./handlers/initiate.ts";
import { handleInitiatePayment } from "./handlers/initiatePayment.ts";
import { handleTransaction } from "./handlers/transaction.ts";
import { handleOrderStatus } from "./handlers/order.ts";
import { handleWebhook } from "./handlers/webhook.ts";
import { logger } from "hono/logger";

const functionName = "payments";
const app = new Hono().basePath(`/${functionName}`);

// ROUTE PAYMENTS
app.use(logger());
app.post("/initiate", handleInitiate);
app.post("/initiate-payment", handleInitiatePayment);
app.get("/order/:order_id", handleOrderStatus);
app.get("/transaction/:transaction_id", handleTransaction);
app.post("/webhook/:payment_gateway", handleWebhook);

// HANDLE 404
app.notFound((c) => {
  return c.json(
    {
      is_successful: false,
      message: "Route Not Found",
    },
    404
  );
});

Deno.serve(app.fetch);

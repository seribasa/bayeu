import { Hono } from "hono";
import { logger } from "hono/logger";
import { paymentRoutes } from "./src/presentation/routes/payment.routes.ts";

const functionName = "payments";
const app = new Hono().basePath(`/${functionName}`);

app.use(logger());
app.route("/", paymentRoutes);

// HANDLE 404
app.notFound((c) => {
  return c.json(
    {
      is_successful: false,
      message: "Route Not Found",
    },
    404,
  );
});

Deno.serve(app.fetch);

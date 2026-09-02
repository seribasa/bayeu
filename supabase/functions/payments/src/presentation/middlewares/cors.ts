import { cors } from "hono/cors";

export const paymentCorsMiddleware = () => {
  const allowedOrigins =
    Deno.env.get("ALLOWED_ORIGINS")?.split(",").map((o) => o.trim()) || [];

  return cors({
    origin: (origin, _c) => {
      if (!origin) return null; // Ignore server-to-server or non-CORS requests
      if (allowedOrigins.includes(origin) || allowedOrigins.includes("*")) {
        return origin;
      }
      return null; // Block others
    },
  });
};

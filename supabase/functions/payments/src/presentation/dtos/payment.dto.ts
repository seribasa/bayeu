import { z } from "zod";

export const initiatePaymentSchema = z
  .object({
    gateway: z.string({ required_error: "Payment gateway is required" }).min(
      1,
      "Payment gateway is required",
    ),
    currency: z.string().optional(),
    amount: z
      .number({
        required_error: "Amount is required",
        invalid_type_error: "Amount must be a positive number",
      })
      .positive("Amount must be a positive number"),
    tenant_id: z.string({ required_error: "Tenant ID is required" }).min(
      1,
      "Tenant ID is required",
    ),
    metadata: z.record(z.unknown()).optional(),
    customer_email: z.string().email("Invalid email format").optional(),
    customer_name: z.string().optional(),
    user_id: z.string().optional(),
    customer_id: z.string().optional(),
    email: z.string().email("Invalid email format").optional(),
    name: z.string().optional(),
    success_url: z.string().optional(),
    return_url: z.string().optional(),
    failed_url: z.string().optional(),
    error_url: z.string().optional(),
    cancel_url: z.string().optional(),
    back_url: z.string().optional(),
  })
  .refine(
    (data) => {
      // Validate gateway against supported ones
      return data.gateway === "stripe" || data.gateway === "midtrans";
    },
    { message: "Payment gateway not supported yet", path: ["gateway"] },
  )
  .refine(
    (data) => {
      if (data.gateway === "stripe" && !data.currency) return false;
      return true;
    },
    { message: "Currency is required", path: ["currency"] },
  );

export type InitiatePaymentDTO = z.infer<typeof initiatePaymentSchema>;

export interface PaymentResponse {
  is_successful: boolean;
  message?: string;
  data?: Record<string, unknown>;
}

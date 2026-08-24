import { Context } from "hono";

export interface PaymentParams {
  orderId: string;
  amount: number;
  currency: string;
  expiryMinutes: number;
  customerName: string;
  customerEmail: string;
}

export interface IPaymentGateway {
  // deno-lint-ignore no-explicit-any
  createTransaction(params: PaymentParams): Promise<any>;
  handleWebhook(c: Context): Promise<Response>;
}

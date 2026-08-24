import { StripeGateway } from "./stripe.ts";
import { MidtransGateway } from "./midtrans.ts";
import { IPaymentGateway } from "./types.ts";

export * from "./types.ts";

export const paymentGateways: Record<string, IPaymentGateway> = {
  stripe: new StripeGateway(),
  midtrans: new MidtransGateway(),
};

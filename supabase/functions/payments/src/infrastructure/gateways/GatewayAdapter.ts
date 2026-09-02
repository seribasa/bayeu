import {
  IGatewayFactory,
  IPaymentGateway,
} from "../../domain/gateways/interfaces.ts";
import { StripeGateway } from "./providers/stripe.ts";
import { MidtransGateway } from "./providers/midtrans.ts";

export class GatewayAdapter implements IGatewayFactory {
  private gateways: Record<string, IPaymentGateway> = {
    stripe: new StripeGateway(),
    midtrans: new MidtransGateway(),
  };

  getGateway(gatewayName: string): IPaymentGateway | undefined {
    return this.gateways[gatewayName];
  }
}

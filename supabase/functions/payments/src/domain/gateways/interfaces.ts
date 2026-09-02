export interface PaymentParams {
  orderId: string;
  amount: number;
  currency: string;
  expiryMinutes?: number;
  customerName?: string;
  customerEmail?: string;
}

export interface IPaymentGateway {
  createTransaction(params: PaymentParams): Promise<Record<string, unknown>>;
}

export interface IGatewayFactory {
  getGateway(gatewayName: string): IPaymentGateway | undefined;
}

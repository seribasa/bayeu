import {
  IOrderRepository,
  IProductRepository,
} from "../domain/repositories/interfaces.ts";
import { IGatewayFactory } from "../domain/gateways/interfaces.ts";
import { PaymentResponse } from "../presentation/dtos/payment.dto.ts";

export interface InitiateItemizedPaymentRequest {
  gateway: string;
  currency?: string;
  items: Array<{ id: string; quantity?: number }>;
}

export class InitiateItemizedPaymentUseCase {
  constructor(
    private orderRepo: IOrderRepository,
    private productRepo: IProductRepository,
    private gatewayFactory: IGatewayFactory,
  ) {}

  async execute(
    request: InitiateItemizedPaymentRequest,
    userId: string,
    email: string,
    name: string,
  ): Promise<PaymentResponse> {
    const { gateway, items } = request;
    const currency = gateway === "midtrans"
      ? "idr"
      : (request.currency || "usd");

    const productIds = items.map((e) => e.id);
    const products = await this.productRepo.findByIds(productIds);

    if (products.length === 0) {
      return { is_successful: false, message: "Invalid products" };
    }

    const totalAmount = products.reduce((acc, product) => {
      const match = items.find((i) => i.id === product.product_id);
      const quantity = match?.quantity || 1;
      return acc + (product.price * quantity);
    }, 0);

    const orderData = await this.orderRepo.createOrder({
      user_id: userId,
      total_amount: totalAmount,
      currency,
      status: "draft",
      gateway: gateway,
      metadata: {},
    });

    const orderItems = products.map((product) => {
      const match = items.find((i) => i.id === product.product_id);
      return {
        order_id: orderData.order_id,
        product_id: product.product_id,
        quantity: match?.quantity || 1,
        price: product.price,
      };
    });

    try {
      await this.orderRepo.createOrderItems(orderItems);
    } catch (_e) {
      await this.orderRepo.deleteOrder(orderData.order_id);
      return { is_successful: false, message: "Failed to create order items" };
    }

    const gatewayService = this.gatewayFactory.getGateway(gateway);
    if (!gatewayService) {
      await this.rollbackOrder(orderData.order_id);
      return { is_successful: false, message: "Unsupported gateway" };
    }

    let response;
    try {
      response = await gatewayService.createTransaction({
        orderId: orderData.order_id,
        amount: totalAmount,
        currency,
        expiryMinutes: 1440,
        customerName: name,
        customerEmail: email,
      });
    } catch (error) {
      await this.rollbackOrder(orderData.order_id);
      throw error;
    }

    try {
      await this.orderRepo.updateOrder(orderData.order_id, {
        gateway_response: response,
      });
    } catch (_e) {
      await this.rollbackOrder(orderData.order_id);
      return { is_successful: false, message: "Failed to update order" };
    }

    return {
      is_successful: true,
      message: "Payment initiated successfully",
      data: response as Record<string, unknown>,
    };
  }

  private async rollbackOrder(orderId: string, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.orderRepo.deleteOrderItems(orderId);
        await this.orderRepo.deleteOrder(orderId);
        return;
      } catch (error) {
        if (attempt === maxRetries) throw error;
      }
    }
  }
}

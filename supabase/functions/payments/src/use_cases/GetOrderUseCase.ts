import { IOrderRepository } from "../domain/repositories/interfaces.ts";
import { PaymentResponse } from "../presentation/dtos/payment.dto.ts";

export class GetOrderUseCase {
  constructor(private orderRepo: IOrderRepository) {}

  async execute(
    orderId: string,
    userId: string,
  ): Promise<PaymentResponse & { status?: number }> {
    try {
      const order = await this.orderRepo.findOrderWithItems(orderId, userId);

      if (!order) {
        return {
          is_successful: false,
          message: "Order not found",
          status: 404,
        };
      }

      return {
        is_successful: true,
        message: "Order found",
        data: order,
      };
    } catch (error) {
      console.error(error);
      return {
        is_successful: false,
        message:
          "Sorry, we are unable to process your payment at this time. Please try again later.",
        status: 500,
      };
    }
  }
}

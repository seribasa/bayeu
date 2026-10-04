import { IOrderRepository } from "../domain/repositories/interfaces.ts";
import { PaymentResponse } from "../presentation/dtos/payment.dto.ts";

export class GetTransactionUseCase {
  constructor(private orderRepo: IOrderRepository) {}

  async execute(
    txId: string,
    userId: string,
  ): Promise<PaymentResponse & { status?: number }> {
    try {
      const result = await this.orderRepo.findTransactionWithOrder(
        txId,
        userId,
      );

      if (!result) {
        return {
          is_successful: false,
          message: "Transaction not found",
          status: 404,
        };
      }

      return {
        is_successful: true,
        message: "Transaction found",
        data: result,
      };
    } catch (error) {
      console.error(error);
      return {
        is_successful: false,
        message:
          "Sorry, we are unable to process this request at this time. Please try again later.",
        status: 500,
      };
    }
  }
}

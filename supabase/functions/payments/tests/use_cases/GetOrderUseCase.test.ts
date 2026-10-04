import { assertEquals } from "https://deno.land/std@0.224.0/testing/asserts.ts";
import { GetOrderUseCase } from "../../src/use_cases/GetOrderUseCase.ts";
import { IOrderRepository } from "../../src/domain/repositories/interfaces.ts";

class MockOrderRepository {
  public findOrderWithItemsResponse: Record<string, unknown> | null = null;
  public findOrderWithItemsError: Error | null = null;

  async findOrderWithItems(orderId: string, userId: string): Promise<Record<string, unknown> | null> {
    if (this.findOrderWithItemsError) {
      throw this.findOrderWithItemsError;
    }
    return this.findOrderWithItemsResponse;
  }
}

Deno.test("GetOrderUseCase - Returns order when found", async () => {
  const repo = new MockOrderRepository();
  const mockOrder = {
    id: "order-123",
    user_id: "user-123",
    total_amount: 100,
    status: "paid",
    currency: "USD",
    created_at: new Date(),
    updated_at: new Date(),
    payment_method: "stripe",
    order_items: []
  };
  repo.findOrderWithItemsResponse = mockOrder;

  const useCase = new GetOrderUseCase(repo as unknown as IOrderRepository);
  const result = await useCase.execute("order-123", "user-123");

  assertEquals(result.is_successful, true);
  assertEquals(result.message, "Order found");
  assertEquals(result.data, mockOrder);
});

Deno.test("GetOrderUseCase - Returns 404 when order not found", async () => {
  const repo = new MockOrderRepository();
  repo.findOrderWithItemsResponse = null;

  const useCase = new GetOrderUseCase(repo as unknown as IOrderRepository);
  const result = await useCase.execute("order-123", "user-123");

  assertEquals(result.is_successful, false);
  assertEquals(result.message, "Order not found");
  assertEquals(result.status, 404);
});

Deno.test("GetOrderUseCase - Returns 500 on repository error", async () => {
  const repo = new MockOrderRepository();
  repo.findOrderWithItemsError = new Error("Database error");

  const useCase = new GetOrderUseCase(repo as unknown as IOrderRepository);
  const result = await useCase.execute("order-123", "user-123");

  assertEquals(result.is_successful, false);
  assertEquals(result.message, "Sorry, we are unable to process your payment at this time. Please try again later.");
  assertEquals(result.status, 500);
});

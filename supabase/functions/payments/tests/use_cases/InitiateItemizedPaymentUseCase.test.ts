import { assertEquals } from "https://deno.land/std@0.224.0/testing/asserts.ts";
import { InitiateItemizedPaymentUseCase } from "../../src/use_cases/InitiateItemizedPaymentUseCase.ts";
import { IOrderRepository, IProductRepository } from "../../src/domain/repositories/interfaces.ts";
import { IGatewayFactory, IPaymentGateway } from "../../src/domain/gateways/interfaces.ts";

class MockOrderRepository {
  public createOrderResponse: any = { order_id: "order-123" };
  async createOrder() { return this.createOrderResponse; }
  async createOrderItems() {}
  async deleteOrder() {}
  async deleteOrderItems() {}
  async updateOrder() {}
}

class MockProductRepository {
  public findByIdsResponse: any[] = [];
  async findByIds() { return this.findByIdsResponse; }
}

class MockGateway implements IPaymentGateway {
  public createTransactionResponse: any = { token: "tok_123" };
  async createTransaction(params: any) { return this.createTransactionResponse; }
}

class MockGatewayFactory implements IGatewayFactory {
  public getGatewayResponse: IPaymentGateway | undefined;
  getGateway() { return this.getGatewayResponse; }
}

Deno.test("InitiateItemizedPaymentUseCase - Invalid products", async () => {
  const orderRepo = new MockOrderRepository();
  const productRepo = new MockProductRepository();
  const factory = new MockGatewayFactory();

  const useCase = new InitiateItemizedPaymentUseCase(
    orderRepo as unknown as IOrderRepository,
    productRepo as unknown as IProductRepository,
    factory
  );

  const result = await useCase.execute(
    { gateway: "stripe", items: [{ id: "prod-1" }] },
    "user-1", "test@test.com", "Test"
  );

  assertEquals(result.is_successful, false);
  assertEquals(result.message, "Invalid products");
});

Deno.test("InitiateItemizedPaymentUseCase - Success", async () => {
  const orderRepo = new MockOrderRepository();
  const productRepo = new MockProductRepository();
  productRepo.findByIdsResponse = [{ product_id: "prod-1", price: 100 }];
  
  const factory = new MockGatewayFactory();
  factory.getGatewayResponse = new MockGateway();

  const useCase = new InitiateItemizedPaymentUseCase(
    orderRepo as unknown as IOrderRepository,
    productRepo as unknown as IProductRepository,
    factory
  );

  const result = await useCase.execute(
    { gateway: "stripe", items: [{ id: "prod-1", quantity: 2 }] },
    "user-1", "test@test.com", "Test"
  );

  assertEquals(result.is_successful, true);
  assertEquals(result.data?.token, "tok_123");
});

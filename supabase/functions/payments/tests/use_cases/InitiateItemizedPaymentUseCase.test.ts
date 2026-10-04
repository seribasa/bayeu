import { assertEquals } from "https://deno.land/std@0.224.0/testing/asserts.ts";
import { InitiateItemizedPaymentUseCase } from "../../src/use_cases/InitiateItemizedPaymentUseCase.ts";
import { IOrderRepository, IProductRepository } from "../../src/domain/repositories/interfaces.ts";
import { IGatewayFactory, IPaymentGateway } from "../../src/domain/gateways/interfaces.ts";

class MockOrderRepository {
  public createOrderResponse: any = { order_id: "order-123" };
  public createOrderItemsThrows = false;
  public updateOrderThrows = false;
  public deleteOrderCalls = 0;
  
  async createOrder() { return this.createOrderResponse; }
  async createOrderItems() {
    if (this.createOrderItemsThrows) throw new Error("createItems error");
  }
  async deleteOrder() { this.deleteOrderCalls++; }
  async deleteOrderItems() {}
  async updateOrder() {
    if (this.updateOrderThrows) throw new Error("updateOrder error");
  }
}

class MockProductRepository {
  public findByIdsResponse: any[] = [];
  async findByIds() { return this.findByIdsResponse; }
}

class MockGateway implements IPaymentGateway {
  public createTransactionResponse: any = { token: "tok_123" };
  public createTransactionThrows = false;
  async createTransaction(params: any) { 
    if (this.createTransactionThrows) throw new Error("gateway error");
    return this.createTransactionResponse; 
  }
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

Deno.test("InitiateItemizedPaymentUseCase - createOrderItems fails causes rollback", async () => {
  const orderRepo = new MockOrderRepository();
  orderRepo.createOrderItemsThrows = true;
  const productRepo = new MockProductRepository();
  productRepo.findByIdsResponse = [{ product_id: "prod-1", price: 100 }];
  const factory = new MockGatewayFactory();
  
  const useCase = new InitiateItemizedPaymentUseCase(
    orderRepo as unknown as IOrderRepository,
    productRepo as unknown as IProductRepository,
    factory
  );

  const result = await useCase.execute(
    { gateway: "midtrans", items: [{ id: "prod-1", quantity: 2 }] },
    "user-1", "test@test.com", "Test"
  );

  assertEquals(result.is_successful, false);
  assertEquals(result.message, "Failed to create order items");
  assertEquals(orderRepo.deleteOrderCalls, 1);
});

Deno.test("InitiateItemizedPaymentUseCase - Unsupported gateway causes rollback", async () => {
  const orderRepo = new MockOrderRepository();
  const productRepo = new MockProductRepository();
  productRepo.findByIdsResponse = [{ product_id: "prod-1", price: 100 }];
  const factory = new MockGatewayFactory();
  factory.getGatewayResponse = undefined;
  
  const useCase = new InitiateItemizedPaymentUseCase(
    orderRepo as unknown as IOrderRepository,
    productRepo as unknown as IProductRepository,
    factory
  );

  const result = await useCase.execute(
    { gateway: "unsupported", items: [{ id: "prod-1", quantity: 2 }] },
    "user-1", "test@test.com", "Test"
  );

  assertEquals(result.is_successful, false);
  assertEquals(result.message, "Unsupported gateway");
  assertEquals(orderRepo.deleteOrderCalls, 1);
});

Deno.test("InitiateItemizedPaymentUseCase - Gateway transaction failure throws and rollbacks", async () => {
  const orderRepo = new MockOrderRepository();
  const productRepo = new MockProductRepository();
  productRepo.findByIdsResponse = [{ product_id: "prod-1", price: 100 }];
  const factory = new MockGatewayFactory();
  const gateway = new MockGateway();
  gateway.createTransactionThrows = true;
  factory.getGatewayResponse = gateway;
  
  const useCase = new InitiateItemizedPaymentUseCase(
    orderRepo as unknown as IOrderRepository,
    productRepo as unknown as IProductRepository,
    factory
  );

  let thrown = false;
  try {
    await useCase.execute(
      { gateway: "stripe", items: [{ id: "prod-1", quantity: 2 }] },
      "user-1", "test@test.com", "Test"
    );
  } catch (e) {
    thrown = true;
    assertEquals(orderRepo.deleteOrderCalls, 1);
  }
  assertEquals(thrown, true);
});

Deno.test("InitiateItemizedPaymentUseCase - Update order failure causes rollback", async () => {
  const orderRepo = new MockOrderRepository();
  orderRepo.updateOrderThrows = true;
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

  assertEquals(result.is_successful, false);
  assertEquals(result.message, "Failed to update order");
  assertEquals(orderRepo.deleteOrderCalls, 1);
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

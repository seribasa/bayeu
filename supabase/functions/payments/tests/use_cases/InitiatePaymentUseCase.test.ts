import { assertEquals } from "https://deno.land/std@0.224.0/testing/asserts.ts";
import { InitiatePaymentUseCase, InitiatePaymentRequest } from "../../src/use_cases/InitiatePaymentUseCase.ts";
import { IOrderRepository, ITenantRepository } from "../../src/domain/repositories/interfaces.ts";
import { IGatewayFactory, IPaymentGateway } from "../../src/domain/gateways/interfaces.ts";
import { IOutpostService } from "../../src/domain/services/interfaces.ts";

class MockOrderRepository {
  public findPaidOrderByInvoiceResponse: any = null;
  public findPendingOrdersByInvoiceResponse: any[] = [];
  public createOrderResponse: any = { order_id: "order-123" };
  public updateOrderCalls: any[] = [];
  public deleteOrderCalls: any[] = [];

  async findPaidOrderByInvoice() { return this.findPaidOrderByInvoiceResponse; }
  async findPendingOrdersByInvoice() { return this.findPendingOrdersByInvoiceResponse; }
  async createOrder() { return this.createOrderResponse; }
  async updateOrder(id: string, payload: any) { this.updateOrderCalls.push({ id, payload }); }
  async deleteOrder(id: string) { this.deleteOrderCalls.push(id); }
}

class MockTenantRepository {
  public findByIdResponse: any = { 
    webhook_url: "http://webhook", 
    default_success_url: "http://success",
    default_failed_url: "http://failed",
    default_cancel_url: "http://cancel" 
  };
  async findById() { return this.findByIdResponse; }
}

class MockOutpostService {
  async upsertDestination() {}
  async publishEvent() {}
}

class MockGateway implements IPaymentGateway {
  public createTransactionResponse: any = { token: "tok_123", redirect_url: "http://redirect" };
  async createTransaction(params: any) { return this.createTransactionResponse; }
}

class MockGatewayFactory implements IGatewayFactory {
  public getGatewayResponse: IPaymentGateway | undefined;
  getGateway() { return this.getGatewayResponse; }
}

Deno.test("InitiatePaymentUseCase - Returns error when Gateway is unsupported", async () => {
  const repo = new MockOrderRepository();
  const tenantRepo = new MockTenantRepository();
  const outpostService = new MockOutpostService();
  const factory = new MockGatewayFactory();
  factory.getGatewayResponse = undefined;

  const useCase = new InitiatePaymentUseCase(
    repo as unknown as IOrderRepository,
    tenantRepo as unknown as ITenantRepository,
    factory,
    outpostService as unknown as IOutpostService
  );
  
  const req: InitiatePaymentRequest = {
    gateway: "unsupported",
    amount: 100,
    tenant_id: "tenant-1",
    user_id: "user-1",
    success_url: "http://success"
  };

  const result = await useCase.execute(req, "user-1", "test@test.com", "Test Name");

  assertEquals(result.is_successful, false);
  assertEquals(result.message, "Unsupported gateway");
  assertEquals(repo.deleteOrderCalls.length, 1);
});

Deno.test("InitiatePaymentUseCase - Success creates transaction and updates order", async () => {
  const repo = new MockOrderRepository();
  const tenantRepo = new MockTenantRepository();
  const outpostService = new MockOutpostService();
  const gateway = new MockGateway();
  const factory = new MockGatewayFactory();
  factory.getGatewayResponse = gateway;

  const useCase = new InitiatePaymentUseCase(
    repo as unknown as IOrderRepository,
    tenantRepo as unknown as ITenantRepository,
    factory,
    outpostService as unknown as IOutpostService
  );
  
  const req: InitiatePaymentRequest = {
    gateway: "stripe",
    amount: 100,
    tenant_id: "tenant-1",
    user_id: "user-1",
    success_url: "http://success" // matches default, so same origin check passes
  };

  const result = await useCase.execute(req, "user-1", "test@test.com", "Test Name");

  assertEquals(result.is_successful, true);
  assertEquals(result.data?.token, "tok_123");
  assertEquals(result.data?.redirect_url, "http://redirect");
  
  assertEquals(repo.updateOrderCalls.length, 1);
  assertEquals(repo.updateOrderCalls[0].id, "order-123");
  assertEquals(repo.updateOrderCalls[0].payload.gateway_response.token, "tok_123");
});

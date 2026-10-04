import { assertEquals } from "https://deno.land/std@0.224.0/testing/asserts.ts";
import { InitiatePaymentUseCase, InitiatePaymentRequest } from "../../src/use_cases/InitiatePaymentUseCase.ts";
import { IOrderRepository, ITenantRepository } from "../../src/domain/repositories/interfaces.ts";
import { IGatewayFactory, IPaymentGateway } from "../../src/domain/gateways/interfaces.ts";
import { IOutpostService } from "../../src/domain/services/interfaces.ts";

class MockOrderRepository {
  public findPaidOrderByInvoiceResponse: any = null;
  public findPendingOrdersByInvoiceResponse: any[] = [];
  public createOrderResponse: any = { order_id: "order-123" };
  public updateOrderThrows = false;
  public updateOrderCalls: any[] = [];
  public deleteOrderCalls: any[] = [];
  public deleteOrderThrows = false;

  async findPaidOrderByInvoice() { return this.findPaidOrderByInvoiceResponse; }
  async findPendingOrdersByInvoice() { return this.findPendingOrdersByInvoiceResponse; }
  async createOrder() { return this.createOrderResponse; }
  async updateOrder(id: string, payload: any) { 
    if (this.updateOrderThrows) throw new Error("update fail");
    this.updateOrderCalls.push({ id, payload }); 
  }
  async deleteOrder(id: string) { 
    if (this.deleteOrderThrows) throw new Error("delete fail");
    this.deleteOrderCalls.push(id); 
  }
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
  public upsertThrows = false;
  async upsertDestination() {
    if (this.upsertThrows) throw new Error("upsert fail");
  }
  async publishEvent() {}
}

class MockGateway implements IPaymentGateway {
  public createTransactionResponse: any = { token: "tok_123", redirect_url: "http://redirect" };
  public createTransactionThrows = false;
  async createTransaction(params: any) { 
    if (this.createTransactionThrows) throw new Error("gateway fail");
    return this.createTransactionResponse; 
  }
}

class MockGatewayFactory implements IGatewayFactory {
  public getGatewayResponse: IPaymentGateway | undefined;
  getGateway() { return this.getGatewayResponse; }
}

Deno.test("InitiatePaymentUseCase - Missing tenant config causes url fail", async () => {
  const repo = new MockOrderRepository();
  const tenantRepo = new MockTenantRepository();
  tenantRepo.findByIdResponse = null;
  const outpost = new MockOutpostService();
  const factory = new MockGatewayFactory();

  const useCase = new InitiatePaymentUseCase(repo as any, tenantRepo as any, factory, outpost as any);
  const result = await useCase.execute({ gateway: "stripe", amount: 100, tenant_id: "t-1", user_id: "u-1" }, "u-1", "a@b", "A");
  assertEquals(result.is_successful, false);
  assertEquals(result.message, "Missing required redirect URL: success_url");
});

Deno.test("InitiatePaymentUseCase - Outpost failure is logged and ignored", async () => {
  const repo = new MockOrderRepository();
  const tenantRepo = new MockTenantRepository();
  const outpost = new MockOutpostService();
  outpost.upsertThrows = true;
  const factory = new MockGatewayFactory();
  factory.getGatewayResponse = new MockGateway();

  const useCase = new InitiatePaymentUseCase(repo as any, tenantRepo as any, factory, outpost as any);
  const result = await useCase.execute({ gateway: "stripe", amount: 100, tenant_id: "t-1", user_id: "u-1" }, "u-1", "a@b", "A");
  assertEquals(result.is_successful, true); // Still passes
});

Deno.test("InitiatePaymentUseCase - Invoice already paid", async () => {
  const repo = new MockOrderRepository();
  repo.findPaidOrderByInvoiceResponse = { order_id: "old-1" };
  const tenantRepo = new MockTenantRepository();
  const outpost = new MockOutpostService();
  const factory = new MockGatewayFactory();

  const useCase = new InitiatePaymentUseCase(repo as any, tenantRepo as any, factory, outpost as any);
  const result = await useCase.execute({ gateway: "stripe", amount: 100, tenant_id: "t-1", user_id: "u-1", metadata: { invoice_id: "inv-1" } }, "u-1", "a@b", "A");
  assertEquals(result.is_successful, false);
  assertEquals(result.message, "This invoice has already been paid.");
});

Deno.test("InitiatePaymentUseCase - Pending order active (unexpired)", async () => {
  const repo = new MockOrderRepository();
  const tenMinsAgo = new Date(Date.now() - 10 * 60000).toISOString();
  repo.findPendingOrdersByInvoiceResponse = [{ gateway: "stripe", gateway_response: { token: "tok_old" }, created_at: tenMinsAgo }];
  const tenantRepo = new MockTenantRepository();
  const outpost = new MockOutpostService();
  const factory = new MockGatewayFactory();
  factory.getGatewayResponse = new MockGateway(); // Needs to be defined to skip unsupported gateway

  const useCase = new InitiatePaymentUseCase(repo as any, tenantRepo as any, factory, outpost as any);
  
  // Expiry is default 1440 mins. 10 mins ago is < 1440, so it returns the old response
  const result = await useCase.execute({ gateway: "stripe", amount: 100, tenant_id: "t-1", user_id: "u-1", metadata: { invoice_id: "inv-1" } }, "u-1", "a@b", "A");
  assertEquals(result.is_successful, true);
  assertEquals(result.data?.token, "tok_old");
});

Deno.test("InitiatePaymentUseCase - Pending order expired creates new", async () => {
  const repo = new MockOrderRepository();
  // Very old order
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60000).toISOString();
  repo.findPendingOrdersByInvoiceResponse = [{ gateway: "stripe", gateway_response: { token: "tok_old" }, created_at: threeDaysAgo }];
  const tenantRepo = new MockTenantRepository();
  const outpost = new MockOutpostService();
  const factory = new MockGatewayFactory();
  factory.getGatewayResponse = new MockGateway();

  const useCase = new InitiatePaymentUseCase(repo as any, tenantRepo as any, factory, outpost as any);
  
  const result = await useCase.execute({ gateway: "stripe", amount: 100, tenant_id: "t-1", user_id: "u-1", metadata: { invoice_id: "inv-1" } }, "u-1", "a@b", "A");
  assertEquals(result.is_successful, true);
  assertEquals(result.data?.token, "tok_123");
});


Deno.test("InitiatePaymentUseCase - Resolve URL localhost fallback allowed", async () => {
  const repo = new MockOrderRepository();
  const tenantRepo = new MockTenantRepository();
  const outpost = new MockOutpostService();
  const factory = new MockGatewayFactory();
  factory.getGatewayResponse = new MockGateway();

  const useCase = new InitiatePaymentUseCase(repo as any, tenantRepo as any, factory, outpost as any);
  
  // Requesting localhost URL (which is allowed)
  const req: InitiatePaymentRequest = { 
    gateway: "stripe", amount: 100, tenant_id: "t-1", user_id: "u-1", 
    metadata: { success_url: "http://localhost:3000/success" } 
  };
  const result = await useCase.execute(req, "u-1", "a@b", "A");
  assertEquals(result.is_successful, true);
});

Deno.test("InitiatePaymentUseCase - Returns error when Gateway is unsupported", async () => {
  const repo = new MockOrderRepository();
  const tenantRepo = new MockTenantRepository();
  const outpost = new MockOutpostService();
  const factory = new MockGatewayFactory();
  factory.getGatewayResponse = undefined;

  const useCase = new InitiatePaymentUseCase(repo as any, tenantRepo as any, factory, outpost as any);
  
  const req: InitiatePaymentRequest = { gateway: "unsupported", amount: 100, tenant_id: "t-1", user_id: "u-1" };
  const result = await useCase.execute(req, "u-1", "a@b", "A");

  assertEquals(result.is_successful, false);
  assertEquals(result.message, "Unsupported gateway");
  assertEquals(repo.deleteOrderCalls.length, 1);
});

Deno.test("InitiatePaymentUseCase - Gateway transaction failure throws and rollbacks", async () => {
  const repo = new MockOrderRepository();
  const tenantRepo = new MockTenantRepository();
  const outpost = new MockOutpostService();
  const factory = new MockGatewayFactory();
  const gateway = new MockGateway();
  gateway.createTransactionThrows = true;
  factory.getGatewayResponse = gateway;

  const useCase = new InitiatePaymentUseCase(repo as any, tenantRepo as any, factory, outpost as any);
  
  const req: InitiatePaymentRequest = { gateway: "stripe", amount: 100, tenant_id: "t-1", user_id: "u-1" };
  let thrown = false;
  try {
    await useCase.execute(req, "u-1", "a@b", "A");
  } catch (_e) {
    thrown = true;
    assertEquals(repo.deleteOrderCalls.length, 1);
  }
  assertEquals(thrown, true);
});

Deno.test("InitiatePaymentUseCase - Order update failure returns error and rollbacks", async () => {
  const repo = new MockOrderRepository();
  repo.updateOrderThrows = true;
  const tenantRepo = new MockTenantRepository();
  const outpost = new MockOutpostService();
  const factory = new MockGatewayFactory();
  factory.getGatewayResponse = new MockGateway();

  const useCase = new InitiatePaymentUseCase(repo as any, tenantRepo as any, factory, outpost as any);
  
  const req: InitiatePaymentRequest = { gateway: "stripe", amount: 100, tenant_id: "t-1", user_id: "u-1" };
  const result = await useCase.execute(req, "u-1", "a@b", "A");

  assertEquals(result.is_successful, false);
  assertEquals(result.message, "Failed to update order with gateway response");
  assertEquals(repo.deleteOrderCalls.length, 1);
});

Deno.test("InitiatePaymentUseCase - Rollback retry loop throws on exhaust", async () => {
  const repo = new MockOrderRepository();
  repo.deleteOrderThrows = true; // This will exhaust maxRetries in rollbackOrder
  const tenantRepo = new MockTenantRepository();
  const outpost = new MockOutpostService();
  const factory = new MockGatewayFactory();
  factory.getGatewayResponse = undefined; // Trigger rollback

  const useCase = new InitiatePaymentUseCase(repo as any, tenantRepo as any, factory, outpost as any);
  
  const req: InitiatePaymentRequest = { gateway: "unsupported", amount: 100, tenant_id: "t-1", user_id: "u-1" };
  let thrown = false;
  try {
    await useCase.execute(req, "u-1", "a@b", "A");
  } catch (e: any) {
    thrown = true;
    assertEquals(e.message, "delete fail");
  }
  assertEquals(thrown, true);
});

Deno.test("InitiatePaymentUseCase - Success creates transaction and updates order", async () => {
  const repo = new MockOrderRepository();
  const tenantRepo = new MockTenantRepository();
  const outpost = new MockOutpostService();
  const gateway = new MockGateway();
  const factory = new MockGatewayFactory();
  factory.getGatewayResponse = gateway;

  const useCase = new InitiatePaymentUseCase(repo as any, tenantRepo as any, factory, outpost as any);
  
  const req: InitiatePaymentRequest = { gateway: "stripe", amount: 100, tenant_id: "t-1", user_id: "u-1" };
  const result = await useCase.execute(req, "u-1", "a@b", "A");

  assertEquals(result.is_successful, true);
  assertEquals(result.data?.token, "tok_123");
  assertEquals(result.data?.redirect_url, "http://redirect");
});

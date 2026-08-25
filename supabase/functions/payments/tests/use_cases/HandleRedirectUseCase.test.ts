import { assertEquals } from "https://deno.land/std@0.224.0/testing/asserts.ts";
import { HandleRedirectUseCase } from "../../src/use_cases/HandleRedirectUseCase.ts";
import { IOrderRepository } from "../../src/domain/repositories/interfaces.ts";
import { IOutpostService } from "../../src/domain/services/interfaces.ts";

class MockOrderRepository {
  public findByIdResponse: any = null;
  public findByIdError: Error | null = null;
  
  async findById() {
    if (this.findByIdError) throw this.findByIdError;
    return this.findByIdResponse;
  }
}

class MockOutpostService {
  async publishEvent() {}
}

Deno.test("HandleRedirectUseCase - Returns 404 when order not found", async () => {
  const repo = new MockOrderRepository();
  const outpost = new MockOutpostService();
  const useCase = new HandleRedirectUseCase(repo as unknown as IOrderRepository, outpost as unknown as IOutpostService);
  
  const result = await useCase.execute("order-1", "success");
  
  if ("error" in result) {
    assertEquals(result.status, 404);
  } else {
    throw new Error("Expected error response");
  }
});

Deno.test("HandleRedirectUseCase - Returns success URL", async () => {
  const repo = new MockOrderRepository();
  repo.findByIdResponse = { metadata: { success_url: "https://example.com/success", invoice_id: "inv-1" } };
  
  const outpost = new MockOutpostService();
  const useCase = new HandleRedirectUseCase(repo as unknown as IOrderRepository, outpost as unknown as IOutpostService);
  
  const result = await useCase.execute("order-1", "success");
  
  if ("url" in result) {
    assertEquals(result.url, "https://example.com/success?invoice_id=inv-1&order_id=order-1&status=success");
  } else {
    throw new Error("Expected URL response");
  }
});

Deno.test("HandleRedirectUseCase - Returns cancel URL", async () => {
  const repo = new MockOrderRepository();
  repo.findByIdResponse = { metadata: { cancel_url: "https://example.com/cancel" } };
  
  const outpost = new MockOutpostService();
  const useCase = new HandleRedirectUseCase(repo as unknown as IOrderRepository, outpost as unknown as IOutpostService);
  
  const result = await useCase.execute("order-1", "cancel");
  
  if ("url" in result) {
    assertEquals(result.url, "https://example.com/cancel?order_id=order-1&status=cancel");
  } else {
    throw new Error("Expected URL response");
  }
});

Deno.test("HandleRedirectUseCase - Returns 400 for invalid scheme", async () => {
  const repo = new MockOrderRepository();
  repo.findByIdResponse = { metadata: { success_url: "javascript:alert(1)" } };
  
  const outpost = new MockOutpostService();
  const useCase = new HandleRedirectUseCase(repo as unknown as IOrderRepository, outpost as unknown as IOutpostService);
  
  const result = await useCase.execute("order-1", "success");
  
  if ("error" in result) {
    assertEquals(result.status, 400);
  } else {
    throw new Error("Expected error response");
  }
});

Deno.test("HandleRedirectUseCase - Handles 500", async () => {
  const repo = new MockOrderRepository();
  repo.findByIdError = new Error("DB fail");
  
  const outpost = new MockOutpostService();
  const useCase = new HandleRedirectUseCase(repo as unknown as IOrderRepository, outpost as unknown as IOutpostService);
  
  const result = await useCase.execute("order-1", "success");
  
  if ("error" in result) {
    assertEquals(result.status, 500);
  } else {
    throw new Error("Expected error response");
  }
});

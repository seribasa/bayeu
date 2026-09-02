import { assertEquals } from "https://deno.land/std@0.224.0/testing/asserts.ts";
import { GetTransactionUseCase } from "../../src/use_cases/GetTransactionUseCase.ts";
import { IOrderRepository } from "../../src/domain/repositories/interfaces.ts";

class MockOrderRepository {
  public findTransactionWithOrderResponse: any = null;
  public findTransactionWithOrderError: Error | null = null;

  async findTransactionWithOrder() {
    if (this.findTransactionWithOrderError) throw this.findTransactionWithOrderError;
    return this.findTransactionWithOrderResponse;
  }
}

Deno.test("GetTransactionUseCase - Returns transaction when found", async () => {
  const repo = new MockOrderRepository();
  repo.findTransactionWithOrderResponse = { id: "tx-1", status: "success" };

  const useCase = new GetTransactionUseCase(repo as unknown as IOrderRepository);
  const result = await useCase.execute("tx-1", "user-1");

  assertEquals(result.is_successful, true);
  assertEquals(result.data?.id, "tx-1");
});

Deno.test("GetTransactionUseCase - Returns 404 when not found", async () => {
  const repo = new MockOrderRepository();
  repo.findTransactionWithOrderResponse = null;

  const useCase = new GetTransactionUseCase(repo as unknown as IOrderRepository);
  const result = await useCase.execute("tx-1", "user-1");

  assertEquals(result.is_successful, false);
  assertEquals(result.status, 404);
});

Deno.test("GetTransactionUseCase - Returns 500 on repository error", async () => {
  const repo = new MockOrderRepository();
  repo.findTransactionWithOrderError = new Error("Database error");

  const useCase = new GetTransactionUseCase(repo as unknown as IOrderRepository);
  const result = await useCase.execute("tx-1", "user-1");

  assertEquals(result.is_successful, false);
  assertEquals(result.status, 500);
});

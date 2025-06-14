import {
  createSnapMidtrans,
  snap,
  verifyMidtransSignature,
} from "./midtrans.ts";
import { assertEquals } from "jsr:@std/assert";
import { stub } from "jsr:@std/testing/mock";

Deno.test("createSnapMidtrans - creates transaction successfully", async () => {
  const mockTransactionResponse: {
    token: string;
    redirect_url: string;
  } = {
    token: "mock_transaction_token",
    redirect_url: "https://mock.redirect.url",
  };

  const midtransStub = stub(
    snap,
    "createTransaction",
    () => Promise.resolve(mockTransactionResponse),
  );

  try {
    const result = await createSnapMidtrans({
      orderId: "test-order",
      totalAmount: 100,
      customerName: "Test Customer",
      customerEmail: "customerEmail",
    });

    assertEquals(result, {
      order_id: "test-order",
      gateway: "midtrans",
      redirect_url: mockTransactionResponse.redirect_url,
      token: result.token,
    });
  } finally {
    midtransStub.restore();
  }
});

Deno.test("createSnapMidtrans - creates transaction throws error", async () => {
  const snapError = new Error("Snap transaction error");

  const midtransStub = stub(
    snap,
    "createTransaction",
    () => Promise.reject(snapError),
  );

  try {
    await createSnapMidtrans({
      orderId: "test-order",
      totalAmount: 100,
      customerName: "Test Customer",
      customerEmail: "customerEmail",
    });
    throw new Error("Expected createSnapMidtrans to throw");
  } catch (err: unknown) {
    const error = err as Error;
    assertEquals(error.message, snapError.message);
  } finally {
    midtransStub.restore();
  }
});

Deno.test("verifyMidtransSignature", () => {
  const signature =
    "e78e2223638cb60dbdbc88d23deb9b927ac41be7263ab38758605bac834dc25425705543707504bfef0802914cfa3f5f538fa308d1f9086211c420e7892ba2ba";

  Deno.env.set("SERVER_KEY", "VT-server-HJMpl9HLr_ntOKt5mRONdmKj");

  const body = {
    order_id: "Postman-1578568851",
    status_code: "200",
    gross_amount: "10000.00",
    server_key: Deno.env.get("SERVER_KEY") || "",
  };

  // Mock the verifyMidtransSignature function
  const result = verifyMidtransSignature({
    signature,
    body,
  });

  // Check if the result is as expected
  assertEquals(result, true);
});

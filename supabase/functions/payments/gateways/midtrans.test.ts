// deno-lint-ignore-file no-explicit-any
import {
  createSnapMidtrans,
  handleMidtransWebhook,
  snap,
  verifyMidtransSignature,
} from "./midtrans.ts";
import { assertEquals } from "jsr:@std/assert";
import { stub } from "jsr:@std/testing/mock";
import { paymentSupabaseAdmin } from "../../_shared/paymentSupabase.ts";

Deno.test("Midtrans Snap Configuration", () => {
  Deno.env.set("MIDTRANS_ENVIRONMENT", "production");
  const localSnap = snap;

  assertEquals(
    localSnap.apiConfig.serverKey,
    "test_midtrans_sandbox_server_key",
  );
  assertEquals(
    localSnap.apiConfig.clientKey,
    "test_midtrans_sandbox_client_key",
  );
});

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

Deno.test("handleMidtransWebhook - should handle valid webhook with transaction status equal to 'pending'", async () => {
  const mockResponse = {
    transaction_status: "pending",
    transaction_id: "test-transaction-id",
    order_id: "test-order-id",
    currency: "IDR",
  };
  const gatewayQuery: any = {
    select: () => ({
      eq: () => ({
        single: () =>
          Promise.resolve({
            data: {
              gateway_id: "midtrans",
            },
            error: null,
          }),
      }),
    }),
  };
  const orderQuery: any = {
    select: () => ({
      eq: () => ({
        single: () =>
          Promise.resolve({
            data: {
              order_id: "test-order-id",
              user_id: "test-user-id",
              total_amount: 10000,
            },
            error: null,
          }),
      }),
    }),
  };
  const paymentQuery: any = {
    insert: () => ({
      select: () => ({
        single: () =>
          Promise.resolve({
            data: {
              payment_id: "test-payment-id",
              order_id: "test-order-id",
              gateway_payment_id: "test-transaction-id",
              gateway_id: "midtrans",
              amount: 10000,
              currency: "IDR",
              status: "pending",
            },
            error: null,
          }),
      }),
    }),
  };
  const transactionsQuery: any = {
    insert: () =>
      Promise.resolve({
        data: {},
        error: null,
      }),
  };
  const fromStub = stub(
    paymentSupabaseAdmin,
    "from",
    (table: string) => {
      if (table === "payment_gateway") return gatewayQuery;
      if (table === "transactions") return transactionsQuery;
      if (table === "orders") return orderQuery;
      if (table === "payments") return paymentQuery;
      return {} as any;
    },
  );

  try {
    const response = await handleMidtransWebhook(mockResponse);
    // response should be an void function
    assertEquals(response, undefined);
  } finally {
    fromStub.restore();
  }
});

Deno.test("handleMidtransWebhook - should throw error when payment gateway not found", async () => {
  const mockResponse = {
    transaction_status: "pending",
    transaction_id: "test-transaction-id",
    order_id: "test-order-id",
    currency: "IDR",
  };
  const gatewayQuery: any = {
    select: () => ({
      eq: () => ({
        single: () =>
          Promise.resolve({
            data: null,
            error: { message: "Payment gateway not found" },
          }),
      }),
    }),
  };
  const fromStub = stub(
    paymentSupabaseAdmin,
    "from",
    (table: string) => {
      if (table === "payment_gateway") return gatewayQuery;
      return {} as any;
    },
  );

  try {
    await handleMidtransWebhook(mockResponse);
    throw new Error("Expected handleMidtransWebhook to throw");
  } catch (err: unknown) {
    const error = err as Error;
    assertEquals(error.message, "Payment gateway not found");
  } finally {
    fromStub.restore();
  }
});

Deno.test("handleMidtransWebhook - should throw error when order error occurs", async () => {
  const mockResponse = {
    transaction_status: "pending",
    transaction_id: "test-transaction-id",
    order_id: "test-order-id",
    currency: "IDR",
  };
  const gatewayQuery: any = {
    select: () => ({
      eq: () => ({
        single: () =>
          Promise.resolve({
            data: {
              gateway_id: "midtrans",
            },
            error: null,
          }),
      }),
    }),
  };
  const orderQuery: any = {
    select: () => ({
      eq: () => ({
        single: () =>
          Promise.resolve({
            data: null,
            error: { message: "Order not found" },
          }),
      }),
    }),
  };
  const fromStub = stub(
    paymentSupabaseAdmin,
    "from",
    (table: string) => {
      if (table === "payment_gateway") return gatewayQuery;
      if (table === "orders") return orderQuery;
      return {} as any;
    },
  );

  try {
    await handleMidtransWebhook(mockResponse);
  } catch (err: unknown) {
    const error = err as Error;
    assertEquals(error.message, "Order not found");
  } finally {
    fromStub.restore();
  }
});

Deno.test("handleMidtransWebhook - should throw error when payment creation fails", async () => {
  const mockResponse = {
    transaction_status: "pending",
    transaction_id: "test-transaction-id",
    order_id: "test-order-id",
    currency: "IDR",
  };
  const gatewayQuery: any = {
    select: () => ({
      eq: () => ({
        single: () =>
          Promise.resolve({
            data: {
              gateway_id: "midtrans",
            },
            error: null,
          }),
      }),
    }),
  };
  const orderQuery: any = {
    select: () => ({
      eq: () => ({
        single: () =>
          Promise.resolve({
            data: {
              order_id: "test-order-id",
              user_id: "test-user-id",
              total_amount: 10000,
            },
            error: null,
          }),
      }),
    }),
  };
  const paymentQuery: any = {
    insert: () => ({
      select: () => ({
        single: () =>
          Promise.resolve({
            data: null,
            error: { message: "Failed to create payment" },
          }),
      }),
    }),
  };
  const fromStub = stub(
    paymentSupabaseAdmin,
    "from",
    (table: string) => {
      if (table === "payment_gateway") return gatewayQuery;
      if (table === "orders") return orderQuery;
      if (table === "payments") return paymentQuery;
      return {} as any;
    },
  );

  try {
    await handleMidtransWebhook(mockResponse);
  } catch (err: unknown) {
    const error = err as Error;
    assertEquals(error.message, "Failed to create payment");
  } finally {
    fromStub.restore();
  }
});

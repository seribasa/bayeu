import { assertEquals } from "jsr:@std/assert";
import {
  mapMidtransToEnum,
  mapStripeToEnum,
  mapTransactionToStatus,
  TransactionStatusEnum,
} from "./paymentHelper.ts";

// Midtrans Tests
Deno.test("mapMidtransToEnum", async (t) => {
  await t.step("should map authorize to processing", () => {
    assertEquals(
      mapMidtransToEnum("authorize"),
      TransactionStatusEnum.processing,
    );
  });

  await t.step("should map capture and settlement to success", () => {
    assertEquals(mapMidtransToEnum("capture"), TransactionStatusEnum.success);
    assertEquals(
      mapMidtransToEnum("settlement"),
      TransactionStatusEnum.success,
    );
  });

  await t.step("should map pending status", () => {
    assertEquals(mapMidtransToEnum("pending"), TransactionStatusEnum.pending);
  });

  await t.step("should map deny and failure to failed", () => {
    assertEquals(mapMidtransToEnum("deny"), TransactionStatusEnum.failed);
    assertEquals(mapMidtransToEnum("failure"), TransactionStatusEnum.failed);
  });

  await t.step("should map cancel to cancelled", () => {
    assertEquals(mapMidtransToEnum("cancel"), TransactionStatusEnum.cancelled);
  });

  await t.step("should map expire to expired", () => {
    assertEquals(mapMidtransToEnum("expire"), TransactionStatusEnum.expired);
  });

  await t.step("should map refund and partial_refund to refunded", () => {
    assertEquals(mapMidtransToEnum("refund"), TransactionStatusEnum.refunded);
    assertEquals(
      mapMidtransToEnum("partial_refund"),
      TransactionStatusEnum.refunded,
    );
  });

  await t.step("should map unknown status to initiated", () => {
    assertEquals(
      mapMidtransToEnum("unknown_status"),
      TransactionStatusEnum.initiated,
    );
  });
});

// Stripe Tests
Deno.test("mapStripeToEnum", async (t) => {
  await t.step("should map payment_intent.created to initiated", () => {
    assertEquals(
      mapStripeToEnum("payment_intent.created"),
      TransactionStatusEnum.initiated,
    );
  });

  await t.step(
    "should map requires_action and partially_funded to pending",
    () => {
      assertEquals(
        mapStripeToEnum("payment_intent.requires_action"),
        TransactionStatusEnum.pending,
      );
      assertEquals(
        mapStripeToEnum("payment_intent.partially_funded"),
        TransactionStatusEnum.pending,
      );
    },
  );

  await t.step("should map processing statuses correctly", () => {
    assertEquals(
      mapStripeToEnum("payment_intent.amount_capturable_updated"),
      TransactionStatusEnum.processing,
    );
    assertEquals(
      mapStripeToEnum("payment_intent.processing"),
      TransactionStatusEnum.processing,
    );
  });

  await t.step("should map succeeded to success", () => {
    assertEquals(
      mapStripeToEnum("payment_intent.succeeded"),
      TransactionStatusEnum.success,
    );
  });
  await t.step("should map payment_failed to failed", () => {
    assertEquals(
      mapStripeToEnum("payment_intent.payment_failed"),
      TransactionStatusEnum.failed,
    );
  });
  await t.step("should map canceled to cancelled", () => {
    assertEquals(
      mapStripeToEnum("payment_intent.canceled"),
      TransactionStatusEnum.cancelled,
    );
  });
  await t.step("should map unknown event to initiated", () => {
    assertEquals(
      mapStripeToEnum("unknown_event"),
      TransactionStatusEnum.initiated,
    );
  });
});

// Transaction Status Tests
Deno.test("mapTransactionToStatus", async (t) => {
  await t.step("should map initiated status", () => {
    assertEquals(mapTransactionToStatus("initiated"), {
      paymentStatus: "initiated",
      orderStatus: "draft",
    });
  });

  await t.step("should map pending status", () => {
    assertEquals(mapTransactionToStatus("pending"), {
      paymentStatus: "waiting_payment",
      orderStatus: "waiting_payment",
    });
  });

  await t.step("should map processing status", () => {
    assertEquals(mapTransactionToStatus("processing"), {
      paymentStatus: "processing",
      orderStatus: "processing",
    });
  });

  await t.step("should map success status", () => {
    assertEquals(mapTransactionToStatus("success"), {
      paymentStatus: "paid",
      orderStatus: "paid",
    });
  });

  await t.step("should map failed status", () => {
    assertEquals(mapTransactionToStatus("failed"), {
      paymentStatus: "failed",
      orderStatus: "failed",
    });
  });

  await t.step("should map expired status", () => {
    assertEquals(mapTransactionToStatus("expired"), {
      paymentStatus: "expired",
      orderStatus: "cancelled",
    });
  });

  await t.step("should map cancelled status", () => {
    assertEquals(mapTransactionToStatus("cancelled"), {
      paymentStatus: "cancelled",
      orderStatus: "cancelled",
    });
  });

  await t.step("should map refunded status", () => {
    assertEquals(mapTransactionToStatus("refunded"), {
      paymentStatus: "refunded",
      orderStatus: "refunded",
    });
  });
  await t.step("should return default for unknown status", () => {
    assertEquals(mapTransactionToStatus("unknown_status"), {
      paymentStatus: "failed",
      orderStatus: "failed",
    });
  });
});

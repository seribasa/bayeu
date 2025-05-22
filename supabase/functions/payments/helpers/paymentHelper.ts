enum TransactionStatusEnum {
  initiated = "initiated",
  pending = "pending",
  processing = "processing",
  success = "success",
  failed = "failed",
  expired = "expired",
  cancelled = "cancelled",
  refunded = "refunded",
}

function mapMidtransToEnum(status: string): TransactionStatusEnum {
  switch (status) {
    case "authorize":
      // Optional handling if you want to distinguish "authorize"
      return TransactionStatusEnum.processing;

    case "capture":
    case "settlement":
      return TransactionStatusEnum.success;

    case "pending":
      return TransactionStatusEnum.pending;

    case "deny":
    case "failure":
      return TransactionStatusEnum.failed;

    case "cancel":
      return TransactionStatusEnum.cancelled;

    case "expire":
      return TransactionStatusEnum.expired;

    case "refund":
    case "partial_refund":
      return TransactionStatusEnum.refunded;

    default:
      // If unknown status, treat as initiated/new
      return TransactionStatusEnum.initiated;
  }
}

function mapStripeToEnum(event: string): TransactionStatusEnum {
  switch (event) {
    case "payment_intent.created":
      return TransactionStatusEnum.initiated;

    case "payment_intent.requires_action":
    case "payment_intent.partially_funded":
      return TransactionStatusEnum.pending;

    case "payment_intent.amount_capturable_updated":
    case "payment_intent.processing":
      return TransactionStatusEnum.processing;

    case "payment_intent.succeeded":
      return TransactionStatusEnum.success;

    case "payment_intent.payment_failed":
      return TransactionStatusEnum.failed;

    case "payment_intent.canceled":
      return TransactionStatusEnum.cancelled;

    default:
      return TransactionStatusEnum.initiated;
  }
}

function mapTransactionToStatus(txStatus: string): {
  paymentStatus: string;
  orderStatus: string;
} {
  const map: Record<string, { paymentStatus: string; orderStatus: string }> = {
    initiated: { paymentStatus: "initiated", orderStatus: "draft" },
    pending: {
      paymentStatus: "waiting_payment",
      orderStatus: "waiting_payment",
    },
    processing: { paymentStatus: "processing", orderStatus: "processing" },
    success: { paymentStatus: "paid", orderStatus: "paid" },
    failed: { paymentStatus: "failed", orderStatus: "failed" },
    expired: { paymentStatus: "expired", orderStatus: "cancelled" },
    cancelled: { paymentStatus: "cancelled", orderStatus: "cancelled" },
    refunded: { paymentStatus: "refunded", orderStatus: "refunded" },
  };

  return map[txStatus] ?? { paymentStatus: "failed", orderStatus: "failed" };
}

export {
  TransactionStatusEnum,
  mapMidtransToEnum,
  mapStripeToEnum,
  mapTransactionToStatus,
};

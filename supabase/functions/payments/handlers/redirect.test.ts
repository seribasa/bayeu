// deno-lint-ignore-file no-explicit-any
import { assertEquals } from "@std/assert";
import { handlePaymentRedirect } from "./redirect.ts";
import { Context } from "hono";
import { stub } from "@std/testing/mock";
import { paymentSupabaseAdmin } from "../../_shared/paymentSupabase.ts";

Deno.test("handlePaymentRedirect - returns 400 if order_id is missing", async () => {
  const c = {
    req: {
      query: (key: string) => (key === "order_id" ? undefined : null),
    },
    text: (msg: string, status: number) => ({ msg, status }),
  } as unknown as Context;

  const res: any = await handlePaymentRedirect(c);
  assertEquals(res.status, 400);
  assertEquals(res.msg, "Missing order_id parameter");
});

Deno.test("handlePaymentRedirect - redirects to success_url on success event", async () => {
  const fromStub = stub(
    paymentSupabaseAdmin,
    "from",
    () =>
      ({
        select: () => ({
          eq: () => ({
            single: () =>
              Promise.resolve({
                data: {
                  order_id: "ord-123",
                  status: "paid",
                  metadata: {
                    success_url: "https://kuala.app/checkout/success",
                    failed_url: "https://kuala.app/checkout/failed",
                    cancel_url: "https://kuala.app/checkout/cancel",
                  },
                },
                error: null,
              }),
          }),
        }),
      }) as any,
  );

  const c = {
    req: {
      query: (key: string) => {
        if (key === "order_id") return "ord-123";
        if (key === "event") return "success";
        return undefined;
      },
    },
    redirect: (url: string, status: number) => ({ url, status }),
  } as unknown as Context;

  try {
    const res: any = await handlePaymentRedirect(c);
    assertEquals(res.status, 302);
    assertEquals(
      res.url,
      "https://kuala.app/checkout/success?order_id=ord-123&status=success",
    );
  } finally {
    fromStub.restore();
  }
});

Deno.test("handlePaymentRedirect - redirects to cancel_url on cancel event", async () => {
  const fromStub = stub(
    paymentSupabaseAdmin,
    "from",
    () =>
      ({
        select: () => ({
          eq: () => ({
            single: () =>
              Promise.resolve({
                data: {
                  order_id: "ord-123",
                  status: "none",
                  metadata: {
                    success_url: "https://kuala.app/checkout/success",
                    failed_url: "https://kuala.app/checkout/failed",
                    cancel_url: "https://kuala.app/checkout/cancel",
                  },
                },
                error: null,
              }),
          }),
        }),
      }) as any,
  );

  const c = {
    req: {
      query: (key: string) => {
        if (key === "order_id") return "ord-123";
        if (key === "event") return "cancel";
        return undefined;
      },
    },
    redirect: (url: string, status: number) => ({ url, status }),
  } as unknown as Context;

  try {
    const res: any = await handlePaymentRedirect(c);
    assertEquals(res.status, 302);
    assertEquals(
      res.url,
      "https://kuala.app/checkout/cancel?order_id=ord-123&status=cancel",
    );
  } finally {
    fromStub.restore();
  }
});

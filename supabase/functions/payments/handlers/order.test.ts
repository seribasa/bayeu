// deno-lint-ignore-file no-explicit-any
import { assertEquals } from "jsr:@std/assert";
import { handleOrderStatus } from "./order.ts";
import { Context } from "jsr:@hono/hono";
import { paymentSupabaseAdmin } from "../../_shared/paymentSupabase.ts";
import { stub } from "jsr:@std/testing/mock";
import { PostgrestQueryBuilder } from "npm:@supabase/postgrest-js@1.19.4";
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { eImunisasiSupabaseAdmin } from "../../_shared/eimunisasiSupabase.ts";
import { UserResponse } from "jsr:@supabase/supabase-js@2";

Deno.test("handleOrderStatus - should return 401 when no authorization header", async () => {
  const mockContext = {
    req: {
      header: () => undefined,
      param: () => "123",
    },
    json: (data: unknown, status?: number) =>
      new Response(JSON.stringify(data), { status }),
  } as unknown as Context;

  const response = await handleOrderStatus(mockContext);
  assertEquals(response.status, 401);
  const resBody = await response.json();
  assertEquals(resBody.is_successful, false);
  assertEquals(resBody.message, "Unauthorized");
});

Deno.test("handleOrderStatus - should return 401 when getUser fails", async () => {
  const userStub = stub(
    eImunisasiSupabaseAdmin.auth,
    "getUser",
    () =>
      Promise.resolve(
        {
          data: { user: null },
          error: { message: "Unauthorized", status: 401 },
        } as UserResponse,
      ),
  );
  const mockContext = {
    req: {
      header: () => "Bearer valid.token",
      param: () => "123",
    },
    json: (data: any, status?: number) => ({ data, status }),
  } as unknown as Context;

  try {
    const response: any = await handleOrderStatus(mockContext);
    assertEquals(response.status, 401);
    const resBody = response.data;
    assertEquals(resBody.is_successful, false);
    assertEquals(resBody.message, "Unauthorized");
  } finally {
    userStub.restore();
  }
});

Deno.test("handleOrderStatus - should return order details when authorized", async () => {
  const mockUser = {
    user: {
      id: "user123",
    },
  };

  const userStub = stub(
    eImunisasiSupabaseAdmin.auth,
    "getUser",
    () => Promise.resolve({ data: mockUser, error: null } as UserResponse),
  );
  const mockOrder = {
    order_id: "123",
    status: "pending",
    total_amount: 100,
    order_items: [{
      order_item_id: "1",
      product: {
        product_id: "1",
        name: "Test Product",
      },
      price: 100,
      quantity: 1,
    }],
  };
  const mockQueryBuilder: Partial<PostgrestQueryBuilder<any, any>> = {
    select: () =>
      ({
        eq: () => ({
          eq: () => ({
            single: () =>
              Promise.resolve({ data: mockOrder, error: null } as any),
          }),
        }),
      }) as any,
  };

  const paymentStub = stub(
    paymentSupabaseAdmin as SupabaseClient,
    "from",
    () => mockQueryBuilder as PostgrestQueryBuilder<any, any>,
  );

  try {
    const context: Context = {
      req: {
        header: () => "Bearer valid.token",
        param: () => "123",
      },
      json: (data: any, status?: number) => ({
        data,
        status: status || 200,
      }),
    } as unknown as Context;
    const response: any = await handleOrderStatus(context as Context);
    assertEquals(response.status, 200);
    const resBody = response.data;
    assertEquals(resBody.is_successful, true);
    assertEquals(resBody.message, "Order found");
    assertEquals(resBody.data.order_id, mockOrder.order_id);
  } finally {
    // Restore stubs
    userStub.restore();
    paymentStub.restore();
  }
});

Deno.test("handleOrderStatus - should return 404 when error code is PGRST116", async () => {
  const mockUser = {
    user: {
      id: "user123",
    },
  };

  const userStub = stub(
    eImunisasiSupabaseAdmin.auth,
    "getUser",
    () => Promise.resolve({ data: mockUser, error: null } as UserResponse),
  );
  const mockQueryBuilder: Partial<PostgrestQueryBuilder<any, any>> = {
    select: () =>
      ({
        eq: () => ({
          eq: () => ({
            single: () =>
              Promise.resolve(
                {
                  data: null,
                  error: { code: "PGRST116", message: "Order not found" },
                } as any,
              ),
          }),
        }),
      }) as any,
  };

  const paymentStub = stub(
    paymentSupabaseAdmin as SupabaseClient,
    "from",
    () => mockQueryBuilder as PostgrestQueryBuilder<any, any>,
  );

  try {
    const context: Context = {
      req: {
        header: () => "Bearer valid.token",
        param: () => "123",
      },
      json: (data: any, status?: number) => ({
        data,
        status: status || 404,
      }),
    } as unknown as Context;
    const response: any = await handleOrderStatus(context as Context);
    assertEquals(response.status, 404);
    const resBody = response.data;
    assertEquals(resBody.is_successful, false);
    assertEquals(resBody.message, "Order not found");
  } finally {
    // Restore stubs
    userStub.restore();
    paymentStub.restore();
  }
});

Deno.test("handleOrderStatus - should return 500 when other error occurs", async () => {
  const mockUser = {
    user: {
      id: "user123",
    },
  };

  const userStub = stub(
    eImunisasiSupabaseAdmin.auth,
    "getUser",
    () => Promise.resolve({ data: mockUser, error: null } as UserResponse),
  );
  const mockQueryBuilder: Partial<PostgrestQueryBuilder<any, any>> = {
    select: () =>
      ({
        eq: () => ({
          eq: () => ({
            single: () =>
              Promise.resolve(
                {
                  data: null,
                  error: { code: "PGRST232", message: "Unexpected error" },
                } as any,
              ),
          }),
        }),
      }) as any,
  };

  const paymentStub = stub(
    paymentSupabaseAdmin as SupabaseClient,
    "from",
    () => mockQueryBuilder as PostgrestQueryBuilder<any, any>,
  );

  try {
    const context: Context = {
      req: {
        header: () => "Bearer valid.token",
        param: () => "123",
      },
      json: (data: any, status?: number) => ({
        data,
        status: status || 500,
      }),
    } as unknown as Context;
    const response: any = await handleOrderStatus(context as Context);
    assertEquals(response.status, 500);
    const resBody = response.data;
    assertEquals(resBody.is_successful, false);

    const message =
      "Sorry, we are unable to process your payment at this time. Please try again later.";
    assertEquals(resBody.message, message);
  } finally {
    // Restore stubs
    userStub.restore();
    paymentStub.restore();
  }
});

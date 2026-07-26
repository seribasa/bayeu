import { paymentSupabaseAdmin } from "../../_shared/paymentSupabase.ts";
import { getAuthToken } from "../../_shared/jwtHelper.ts";
import { eImunisasiSupabaseAdmin } from "../../_shared/eimunisasiSupabase.ts";
import { Context } from "jsr:@hono/hono";

export const handleOrderStatus = async (c: Context) => {
  const orderId = c.req.param("order_id");

  // get the customer details from jwt token
  const authorization = c.req.header("Authorization");
  if (!authorization) {
    return c.json(
      {
        is_successful: false,
        message: "Unauthorized",
      },
      401
    );
  }
  const jwt = getAuthToken(authorization);
  const { data: userData, error: userError } =
    await eImunisasiSupabaseAdmin.auth.getUser(jwt);
  if (userError) {
    console.error(userError);
    return c.json(
      {
        is_successful: false,
        message: "Unauthorized",
      },
      401
    );
  }
  const { id: userId } = userData.user;

  const { data, error } = await paymentSupabaseAdmin
    .from("orders")
    .select(
      `
      order_id,
      status,
      total_amount,
      created_at,
      updated_at,
      gateway_response,
      order_items (
        order_item_id,
        product:products (product_id,name),
        price,
        quantity
      )
    `
    )
    .eq("order_id", orderId)
    .eq("user_id", userId)
    .single();

  if (error) {
    console.error(error);
    let message =
      "Sorry, we are unable to process your payment at this time. Please try again later.";
    let status: 404 | 500 = 500;
    if (error.code === "PGRST116") {
      message = "Order not found";
      status = 404;
    }
    return c.json(
      {
        is_successful: false,
        message,
      },
      status
    );
  }
  return c.json(
    {
      is_successful: true,
      message: "Order found",
      data,
    },
    200
  );
};

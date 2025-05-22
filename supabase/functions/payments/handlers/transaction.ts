import { paymentSupabaseAdmin } from "../../_shared/paymentSupabase.ts";
import { getAuthToken } from "../../_shared/jwtHelper.ts";
import { eImunisasiSupabaseAdmin } from "../../_shared/eimunisasiSupabase.ts";
import { Context } from "jsr:@hono/hono";

export const handleTransaction = async (c: Context) => {
  const txId = c.req.param("transaction_id");

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
    .from("transactions")
    .select(
      `
      *,
      payments:payments (
        order_id
      )
      `
    )
    .eq("transaction_id", txId)
    .single();

  const { count, error: errorCount } = await paymentSupabaseAdmin
    .from("orders")
    .select("*", { count: "exact", head: true })
    .eq("order_id", data?.payment?.order_id)
    .eq("user_id", userId);

  if (errorCount) {
    console.error(errorCount);
    throw new Error("Error fetching order count");
  }

  if (count === 0) {
    throw {
      code: "PGRST116",
      message: "Transaction not found",
    };
  }

  if (error) {
    console.log(error);
    let message =
      "Sorry, we are unable to process this request at this time. Please try again later.";
    let status: 404 | 500 = 500;
    if (error.code === "PGRST116") {
      message = "Transaction not found";
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
  return c.json({
    is_successful: true,
    message: "Transaction found",
    data: data,
  });
};

import { Context } from "jsr:@hono/hono";
import { eImunisasiSupabaseAdmin } from "../../_shared/eimunisasiSupabase.ts";
import { paymentSupabaseAdmin } from "../../_shared/paymentSupabase.ts";
import { getAuthToken } from "../../_shared/jwtHelper.ts";
import { createStripeIntent } from "../gateways/stripe.ts";
import { createSnapMidtrans } from "../gateways/midtrans.ts";

async function rollbackOrder(orderId: string, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await paymentSupabaseAdmin
        .from("orders")
        .delete()
        .eq("order_id", orderId);

      await paymentSupabaseAdmin
        .from("order_items")
        .delete()
        .eq("order_id", orderId);

      return; // Success, exit function
    } catch (error) {
      console.error(`Rollback attempt ${attempt} failed:`, error);
      if (attempt === maxRetries) {
        console.error("Max retries reached, rollback failed permanently");
        throw error;
      }
      // Wait before retrying (exponential backoff)
      await new Promise((resolve) =>
        setTimeout(resolve, Math.pow(2, attempt) * 1000)
      );
    }
  }
}

// deno-lint-ignore no-explicit-any
async function validateProducts(products: any[]): Promise<boolean> {
  const productIds = products.map((e) => e.id);
  const { data, error } = await paymentSupabaseAdmin
    .from("products")
    .select("product_id")
    .in("product_id", productIds);

  if (error) {
    console.error("Error validating products:", error);
    return false;
  }

  return data.length > 0;
}

// deno-lint-ignore no-explicit-any
function validateBody(body: any): string | null {
  if (!body) {
    return "Invalid request body";
  }
  if (typeof body !== "object") {
    return "Request body must be an object";
  }
  if (!body.gateway) {
    return "Payment gateway is required";
  }
  if (body.gateway !== "stripe" && body.gateway !== "midtrans") {
    return "Payment gateway not supported yet";
  }
  if (body.gateway == "stripe" && !body.currency) {
    return "Currency is required";
  }
  if (!body.items) {
    return "Items are required";
  }
  if (!Array.isArray(body.items)) {
    return "Items must be an array";
  }
  if (body.items.length === 0) {
    return "Items array cannot be empty";
  }
  return null;
}

export const handleInitiate = async (c: Context) => {
  try {
    const req = c.req;
    const body = await req.json();
    if (!body || typeof body !== "object") {
      return c.json(
        {
          is_successful: false,
          message: "Invalid request body",
        },
        400
      );
    }
    const { gateway, items } = body;

    const currency = gateway === "midtrans" ? "idr" : body.currency;

    // Validate required fields
    const errorMessageBodyRequest = validateBody(body);
    if (errorMessageBodyRequest) {
      return c.json(
        {
          is_successful: false,
          message: errorMessageBodyRequest,
        },
        400
      );
    }

    // validate products
    const isValidProducts = await validateProducts(items);
    if (!isValidProducts) {
      return c.json(
        {
          is_successful: false,
          message: "Invalid products",
        },
        400
      );
    }

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
    const { id: userId, email, user_metadata } = userData.user;
    const { name } = user_metadata;

    // get the amount from the items
    const productIds = items.map((e: { id: string }) => e.id);
    const { data: itemsData, error: itemsError } = await paymentSupabaseAdmin
      .from("products")
      .select("price, product_id")
      .in("product_id", productIds);

    if (itemsError) {
      throw itemsError;
    }

    const totalAmount = itemsData.reduce(
      (acc: number, item: { price: number; product_id: string }) => {
        const matchingItem = items.find(
          (orderItem: { id: string }) => orderItem.id === item.product_id
        );
        const quantity = matchingItem?.quantity || 1;
        return acc + item.price * quantity;
      },
      0
    );

    // insert order to database
    const { data: orderData, error: orderError } = await paymentSupabaseAdmin
      .from("orders")
      .insert({
        user_id: userId,
        total_amount: totalAmount,
        currency,
        status: "draft",
        created_at: new Date(),
      })
      .select()
      .single();

    if (orderError) {
      throw orderError;
    }

    // insert order items to database
    const orderItems = itemsData.map(
      (item: { product_id: string; price: number }) => {
        const matchingItem = items.find(
          (orderItem: { id: string }) => orderItem.id === item.product_id
        );

        return {
          order_id: orderData.order_id,
          product_id: item.product_id,
          quantity: matchingItem?.quantity || 1,
          price: item.price,
          created_at: new Date(),
        };
      }
    );

    const { error: orderItemsError } = await paymentSupabaseAdmin
      .from("order_items")
      .insert(orderItems);

    if (orderItemsError) {
      await rollbackOrder(orderData.order_id);

      throw orderItemsError;
    }
    const orderId = orderData.order_id;
    let response;
    if (gateway === "stripe") {
      try {
        response = await createStripeIntent({
          orderId,
          amount: totalAmount,
          currency,
          customerId: userId,
        });
      } catch (error) {
        await rollbackOrder(orderData.order_id);
        console.error("Stripe error:");
        throw error;
      }
    } else if (gateway === "midtrans") {
      try {
        response = await createSnapMidtrans({
          orderId,
          totalAmount,
          customerName: name,
          customerEmail: email,
        });
      } catch (error) {
        await rollbackOrder(orderData.order_id);
        console.error("Midtrans error:");
        throw error;
      }
    }
    // update order "gateway_response" with the response from the payment gateway
    const { error: updateOrderError } = await paymentSupabaseAdmin
      .from("orders")
      .update({
        gateway_response: response,
        updated_at: new Date(),
      })
      .eq("order_id", orderId);

    if (updateOrderError) {
      await rollbackOrder(orderData.order_id);
      console.error("Error updating order:", updateOrderError);
      return c.json(
        {
          is_successful: false,
          message: "Failed to update order",
        },
        500
      );
    }
    
    return c.json({
      is_successful: true,
      message: "Payment initiated successfully",
      data: response,
    });
  } catch (error) {
    console.error(error);
    return c.json(
      {
        is_successful: false,
        message:
          "Sorry, we are unable to process your payment at this time. Please try again later.",
      },
      500
    );
  }
};

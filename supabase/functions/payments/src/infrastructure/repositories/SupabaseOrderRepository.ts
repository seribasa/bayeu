import { SupabaseClient } from "@supabase/supabase-js";
import { Order, OrderItem } from "../../domain/entities/types.ts";
import { IOrderRepository } from "../../domain/repositories/interfaces.ts";

export class SupabaseOrderRepository implements IOrderRepository {
  constructor(private client: SupabaseClient) {}

  async findOrderWithItems(
    orderId: string,
    userId: string,
  ): Promise<Record<string, unknown> | null> {
    const { data, error } = await this.client.from("orders").select(
      `order_id, status, total_amount, created_at, updated_at, gateway_response, order_items ( order_item_id, product:products (product_id,name), price, quantity )`,
    ).eq("order_id", orderId).eq("user_id", userId).single();
    if (error) {
      if (error.code === "PGRST116") return null;
      throw error;
    }
    return data as Record<string, unknown>;
  }

  async findById(orderId: string): Promise<Order | null> {
    const { data, error } = await this.client
      .from("orders")
      .select("*")
      .eq("order_id", orderId)
      .maybeSingle();

    if (error) throw error;
    return data as Order | null;
  }

  async findPendingOrdersByInvoice(
    userId: string,
    tenantId: string,
    invoiceId: string,
  ): Promise<Order[]> {
    const { data, error } = await this.client
      .from("orders")
      .select("*")
      .eq("user_id", userId)
      .eq("metadata->>invoice_id", invoiceId)
      .eq("metadata->>tenant_id", tenantId);

    if (error) throw error;

    // Filter pending
    return (data || []).filter((o: Order) =>
      !["paid", "cancelled", "failed", "refunded", "expire"].includes(o.status)
    );
  }

  async findPaidOrderByInvoice(
    userId: string,
    tenantId: string,
    invoiceId: string,
  ): Promise<Order | null> {
    const { data, error } = await this.client
      .from("orders")
      .select("*")
      .eq("user_id", userId)
      .eq("metadata->>invoice_id", invoiceId)
      .eq("metadata->>tenant_id", tenantId)
      .eq("status", "paid")
      .maybeSingle();

    if (error) throw error;
    return data as Order | null;
  }

  async createOrder(
    order: Omit<Order, "order_id" | "created_at" | "updated_at">,
  ): Promise<Order> {
    const { data, error } = await this.client
      .from("orders")
      .insert(order)
      .select("*")
      .single();

    if (error) throw error;
    return data as Order;
  }

  async updateOrder(orderId: string, data: Partial<Order>): Promise<void> {
    const { error } = await this.client
      .from("orders")
      .update({ ...data, updated_at: new Date() })
      .eq("order_id", orderId);

    if (error) throw error;
  }

  async deleteOrder(orderId: string): Promise<void> {
    const { error } = await this.client
      .from("orders")
      .delete()
      .eq("order_id", orderId);

    if (error) throw error;
  }

  async createOrderItems(items: OrderItem[]): Promise<void> {
    const { error } = await this.client.from("order_items").insert(items);
    if (error) throw error;
  }

  async deleteOrderItems(orderId: string): Promise<void> {
    const { error } = await this.client.from("order_items").delete().eq(
      "order_id",
      orderId,
    );
    if (error) throw error;
  }

  async findTransactionWithOrder(
    txId: string,
    userId: string,
  ): Promise<Record<string, unknown> | null> {
    const { data, error } = await this.client
      .from("transactions")
      .select("*, payments:payments ( order_id )")
      .eq("transaction_id", txId)
      .single();

    if (error) {
      if (error.code === "PGRST116") return null;
      throw error;
    }

    const { count, error: errorCount } = await this.client
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq(
        "order_id",
        (data as unknown as { payments?: { order_id?: string } })?.payments
          ?.order_id,
      )
      .eq("user_id", userId);

    if (errorCount) throw errorCount;
    if (count === 0) return null;

    return data as Record<string, unknown>;
  }
}

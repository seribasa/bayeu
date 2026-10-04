import { Order, OrderItem, Product, Tenant } from "../entities/types.ts";

export interface IOrderRepository {
  findById(orderId: string): Promise<Order | null>;
  findOrderWithItems(
    orderId: string,
    userId: string,
  ): Promise<Record<string, unknown> | null>;
  findTransactionWithOrder(
    txId: string,
    userId: string,
  ): Promise<Record<string, unknown> | null>;
  findPendingOrdersByInvoice(
    userId: string,
    tenantId: string,
    invoiceId: string,
  ): Promise<Order[]>;
  findPaidOrderByInvoice(
    userId: string,
    tenantId: string,
    invoiceId: string,
  ): Promise<Order | null>;
  createOrder(
    order: Omit<Order, "order_id" | "created_at" | "updated_at">,
  ): Promise<Order>;
  updateOrder(orderId: string, data: Partial<Order>): Promise<void>;
  deleteOrder(orderId: string): Promise<void>;
  createOrderItems(items: OrderItem[]): Promise<void>;
  deleteOrderItems(orderId: string): Promise<void>;
}

export interface ITenantRepository {
  findById(tenantId: string): Promise<Tenant | null>;
}

export interface IProductRepository {
  findByIds(productIds: string[]): Promise<Product[]>;
}

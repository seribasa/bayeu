export interface Order {
  order_id: string;
  user_id: string;
  total_amount: number;
  currency: string;
  status: string;
  gateway: string;
  metadata?: Record<string, unknown>;
  gateway_response?: Record<string, unknown>;
  created_at?: Date;
  updated_at?: Date;
}

export interface Tenant {
  tenant_id: string;
  default_success_url: string;
  default_failed_url: string;
  default_cancel_url: string;
  webhook_url: string;
}

export interface Product {
  product_id: string;
  name: string;
  price: number;
}

export interface OrderItem {
  order_item_id?: string;
  order_id: string;
  product_id: string;
  quantity: number;
  price: number;
  created_at?: Date;
}

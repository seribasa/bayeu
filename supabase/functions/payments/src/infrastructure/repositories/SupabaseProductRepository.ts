import { SupabaseClient } from "@supabase/supabase-js";
import { Product } from "../../domain/entities/types.ts";
import { IProductRepository } from "../../domain/repositories/interfaces.ts";

export class SupabaseProductRepository implements IProductRepository {
  constructor(private client: SupabaseClient) {}

  async findByIds(productIds: string[]): Promise<Product[]> {
    if (productIds.length === 0) return [];
    const { data, error } = await this.client
      .from("products")
      .select("product_id, name, price")
      .in("product_id", productIds);

    if (error) throw error;
    return data as Product[];
  }
}

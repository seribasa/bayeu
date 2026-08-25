import { SupabaseClient } from "@supabase/supabase-js";
import { Tenant } from "../../domain/entities/types.ts";
import { ITenantRepository } from "../../domain/repositories/interfaces.ts";

export class SupabaseTenantRepository implements ITenantRepository {
  constructor(private client: SupabaseClient) {}

  async findById(tenantId: string): Promise<Tenant | null> {
    const { data, error } = await this.client
      .from("tenants")
      .select("*")
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (error) throw error;
    return data as Tenant | null;
  }
}

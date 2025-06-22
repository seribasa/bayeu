import { createClient } from "jsr:@supabase/supabase-js@2";

const PAYMENT_SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const PAYMENT_SUPABASE_SERVICE_ROLE_KEY = Deno.env.get(
  "SUPABASE_SERVICE_ROLE_KEY",
);
const PAYMENT_SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

const paymentSupabaseAdmin = createClient(
  PAYMENT_SUPABASE_URL ?? "",
  PAYMENT_SUPABASE_SERVICE_ROLE_KEY ?? "",
);

const paymentSupabaseClient = (
  { authorization }: { authorization: string },
) => {
  return createClient(
    PAYMENT_SUPABASE_URL ?? "",
    PAYMENT_SUPABASE_ANON_KEY ?? "",
    {
      global: { headers: { Authorization: authorization } },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
};

export { paymentSupabaseAdmin, paymentSupabaseClient };

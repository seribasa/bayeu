import { assertEquals, assertExists } from "jsr:@std/assert";
import {
  paymentSupabaseAdmin,
  paymentSupabaseClient,
} from "./paymentSupabase.ts";

Deno.test("paymentSupabaseAdmin client initialization", () => {
  assertExists(paymentSupabaseAdmin, "Admin client should be initialized");
  assertEquals(
    typeof paymentSupabaseAdmin.auth,
    "object",
    "Should have auth property",
  );
});

Deno.test("paymentSupabaseClient initialization with authorization", () => {
  const testAuth = "Bearer test-token";
  const client = paymentSupabaseClient({ authorization: testAuth });

  assertExists(client, "Client should be initialized");
  assertEquals(typeof client.auth, "object", "Should have auth property");
});

Deno.test("paymentSupabaseClient should use provided authorization header", () => {
  const testAuth = "Bearer test-token";
  const client = paymentSupabaseClient({ authorization: testAuth });

  // @ts-ignore - Accessing internal config for testing
  const headers = client.rest.headers;
  assertEquals(
    headers["Authorization"],
    testAuth,
    "Should set correct authorization header",
  );
});

Deno.test("paymentSupabaseClient initialization without environment variables", () => {
  const url = Deno.env.get("EIMUNISASI_SUPABASE_URL");
  const anonKey = Deno.env.get("EIMUNISASI_SUPABASE_ANON_KEY");

  assertExists(url, "EIMUNISASI_SUPABASE_URL should be set");
  assertExists(
    anonKey,
    "EIMUNISASI_SUPABASE_ANON_KEY should be set",
  );

  Deno.env.delete("EIMUNISASI_SUPABASE_URL");
  Deno.env.delete("EIMUNISASI_SUPABASE_ANON_KEY");

  const testAuth = "Bearer test-token";

  const client = paymentSupabaseClient({ authorization: testAuth });
  assertExists(client, "client should be initialized");
  assertEquals(
    typeof client.auth,
    "object",
    "Should have auth property",
  );

  // Clean up environment variables
  Deno.env.set("EIMUNISASI_SUPABASE_URL", url!);
  Deno.env.set("EIMUNISASI_SUPABASE_ANON_KEY", anonKey!);
});

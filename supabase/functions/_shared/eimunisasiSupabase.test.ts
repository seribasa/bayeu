import { assertEquals, assertExists } from "jsr:@std/assert";
import {
  eImunisasiSupabaseAdmin,
  eImunisasiSupabaseClient,
} from "./eimunisasiSupabase.ts";

Deno.test("eImunisasiSupabaseAdmin client initialization", () => {
  assertExists(eImunisasiSupabaseAdmin, "Admin client should be initialized");
  assertEquals(
    typeof eImunisasiSupabaseAdmin.auth,
    "object",
    "Should have auth property",
  );
});

Deno.test("eImunisasiSupabaseClient initialization with authorization", () => {
  const testAuth = "Bearer test-token";
  const client = eImunisasiSupabaseClient({ authorization: testAuth });

  assertExists(client, "Client should be initialized");
  assertEquals(typeof client.auth, "object", "Should have auth property");
});

Deno.test("eImunisasiSupabaseClient should use provided authorization header", () => {
  const testAuth = "Bearer test-token";
  const client = eImunisasiSupabaseClient({ authorization: testAuth });

  // @ts-ignore - Accessing internal config for testing
  const headers = client.rest.headers;
  assertEquals(
    headers["Authorization"],
    testAuth,
    "Should set correct authorization header",
  );
});

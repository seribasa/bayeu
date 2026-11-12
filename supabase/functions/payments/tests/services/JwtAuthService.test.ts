import { assertEquals } from "https://deno.land/std@0.224.0/assert/assert_equals.ts";
import { JwtAuthService } from "../../src/infrastructure/services/JwtAuthService.ts";

Deno.test("JwtAuthService - extractUserFromHeader decodes JWT correctly", () => {
  const service = new JwtAuthService();
  // Construct a base64url encoded JWT payload
  const payload = {
    sub: "test-user-id-123",
    email: "pasien@kasih.com",
    user_metadata: { full_name: "Pasien Kasih" },
  };
  const token = `header.${btoa(JSON.stringify(payload)).replace(/\+/g, "-").replace(/\//g, "_")}.sig`;
  const result = service.extractUserFromHeader(`Bearer ${token}`);

  assertEquals(result?.userId, "test-user-id-123");
  assertEquals(result?.email, "pasien@kasih.com");
  assertEquals(result?.name, "Pasien Kasih");
});

Deno.test("JwtAuthService - verifyUser falls back to extractUserFromHeader when userClient fails", async () => {
  // Mock client where auth.getUser returns an error (e.g. cross-realm user from Kasih)
  const mockClient = {
    auth: {
      getUser: () => Promise.resolve({ data: null, error: new Error("User not found in e-imunisasi") }),
    },
  } as any;

  const service = new JwtAuthService(mockClient);
  const payload = {
    sub: "kasih-patient-uuid-456",
    email: "ibu@kasih.com",
    user_metadata: { name: "Ibu Pasien" },
  };
  const token = `header.${btoa(JSON.stringify(payload)).replace(/\+/g, "-").replace(/\//g, "_")}.sig`;
  const result = await service.verifyUser(`Bearer ${token}`);

  assertEquals(result?.userId, "kasih-patient-uuid-456");
  assertEquals(result?.email, "ibu@kasih.com");
  assertEquals(result?.name, "Ibu Pasien");
});

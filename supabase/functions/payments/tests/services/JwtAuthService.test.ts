import { assertEquals } from "https://deno.land/std@0.224.0/assert/assert_equals.ts";
import * as jose from "jose";
import { JwtAuthService } from "../../src/infrastructure/services/JwtAuthService.ts";

Deno.test("JwtAuthService - extractUserFromHeader decodes JWT correctly", () => {
  const service = new JwtAuthService();
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

Deno.test("JwtAuthService - verifyUser validates via userClient when available", async () => {
  const mockClient = {
    auth: {
      getUser: (_token: string) =>
        Promise.resolve({
          data: {
            user: {
              id: "client-user-123",
              email: "client@test.com",
              user_metadata: { name: "Client User" },
            },
          },
          error: null,
        }),
    },
  } as any;

  const service = new JwtAuthService(mockClient);
  const result = await service.verifyUser("Bearer some.valid.token");
  assertEquals(result?.userId, "client-user-123");
  assertEquals(result?.email, "client@test.com");
  assertEquals(result?.name, "Client User");
});

Deno.test("JwtAuthService - verifyUser cryptographically verifies cross-realm token with trusted secret", async () => {
  const testSecret = "super-secret-jwt-key-for-testing-12345";
  const encoder = new TextEncoder();
  const token = await new jose.SignJWT({
    email: "crossrealm@kasih.com",
    user_metadata: { full_name: "Cross Realm User" },
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("cross-realm-sub-789")
    .setExpirationTime("1h")
    .sign(encoder.encode(testSecret));

  // Service with failing userClient but configured with trustedSecrets
  const mockClient = {
    auth: {
      getUser: () =>
        Promise.resolve({
          data: null,
          error: new Error("User not found in local realm"),
        }),
    },
  } as any;

  const service = new JwtAuthService(mockClient, [testSecret]);
  const result = await service.verifyUser(`Bearer ${token}`);

  assertEquals(result?.userId, "cross-realm-sub-789");
  assertEquals(result?.email, "crossrealm@kasih.com");
  assertEquals(result?.name, "Cross Realm User");
});

Deno.test("JwtAuthService - verifyUser rejects forged tokens with invalid signature", async () => {
  const testSecret = "trusted-secret-123";
  const forgedSecret = "attacker-secret-999";
  const encoder = new TextEncoder();
  const forgedToken = await new jose.SignJWT({
    email: "attacker@fake.com",
    user_metadata: { name: "Attacker" },
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("attacker-uuid")
    .setExpirationTime("1h")
    .sign(encoder.encode(forgedSecret));

  const service = new JwtAuthService(undefined, [testSecret]);
  const result = await service.verifyUser(`Bearer ${forgedToken}`);

  assertEquals(result, null);
});

Deno.test("JwtAuthService - verifyUser rejects forged tokens with dummy .sig signature", async () => {
  const payload = {
    sub: "forged-uuid",
    email: "hacker@test.com",
  };
  const token = `header.${btoa(JSON.stringify(payload)).replace(/\+/g, "-").replace(/\//g, "_")}.sig`;
  const service = new JwtAuthService(undefined, ["secret1", "secret2"]);
  const result = await service.verifyUser(`Bearer ${token}`);

  assertEquals(result, null);
});

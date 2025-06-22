import { assertEquals, assertThrows } from "jsr:@std/assert";
import { getAuthToken, verifyJWT } from "./jwtHelper.ts";
import * as jose from "https://deno.land/x/jose@v4.14.4/index.ts";

Deno.test("getAuthToken", async (t) => {
    await t.step("should extract token from valid Bearer authorization header", () => {
        const token = "valid.jwt.token";
        const authHeader = `Bearer ${token}`;
        const result = getAuthToken(authHeader);
        assertEquals(result, token);
    });

    await t.step("should throw error when authorization header is empty", () => {
        assertThrows(
            () => getAuthToken(""),
            Error,
            "Missing authorization header",
        );
    });

    await t.step("should throw error when authorization header doesn't start with Bearer", () => {
        assertThrows(
            () => getAuthToken("Basic token123"),
            Error,
            "Auth header is not 'Bearer {token}'",
        );
    });

    await t.step("should throw error when authorization header is malformed", () => {
        assertThrows(
            () => getAuthToken("Bearer"),
            Error,
            "Auth header is not 'Bearer {token}'",
        );
    });
});

Deno.test("verifyJWT", async (t) => {
    await t.step("should return true for valid JWT", async () => {
        const secret = "your-256-bit-secret";
        const testJwt = await new jose.SignJWT(
            { sub: "1234567890", name: "John Doe", iat: 1516239022 },
        )
            .setProtectedHeader({ alg: "HS256" })
            .sign(new TextEncoder().encode(secret));
        const result = await verifyJWT(testJwt, secret);
        assertEquals(result, true);
        
    });

    await t.step("should return false for invalid JWT", async () => {
        const invalidJWT = "invalid.jwt.token";
        const secret = "your-256-bit-secret";
        const result = await verifyJWT(invalidJWT, secret);
        assertEquals(result, false);
    });

    await t.step("should return false for JWT with wrong secret", async () => {
        const validJWT = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
        const wrongSecret = "wrong-secret";
        const result = await verifyJWT(validJWT, wrongSecret);
        assertEquals(result, false);
    });
});
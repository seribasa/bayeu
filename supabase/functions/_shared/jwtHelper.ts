import * as jose from "https://deno.land/x/jose@v4.14.4/index.ts";

export function getAuthToken(authorization: string): string {
  const authHeader = authorization;
  if (!authHeader) {
    throw new Error("Missing authorization header");
  }
  const [bearer, token] = authHeader.split(" ");
  if (bearer.toLowerCase() !== "bearer" || !token) {
    throw new Error(`Auth header is not 'Bearer {token}'`);
  }
  return token;
}

export async function verifyJWT(
  jwt: string,
  jwtSecret: string,
): Promise<boolean> {
  const encoder = new TextEncoder();
  const secretKey = encoder.encode(jwtSecret);
  try {
    await jose.jwtVerify(jwt, secretKey);
  } catch (err) {
    console.error(err);
    return false;
  }
  return true;
}

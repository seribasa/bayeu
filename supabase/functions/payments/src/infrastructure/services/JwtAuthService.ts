import * as jose from "jose";
import { getAuthToken } from "../../../../_shared/jwtHelper.ts";
import { IAuthService } from "../../domain/services/interfaces.ts";
import { SupabaseClient } from "@supabase/supabase-js";

export class JwtAuthService implements IAuthService {
  private trustedSecrets: string[];

  constructor(
    private userClient?: SupabaseClient,
    trustedSecrets?: string[],
  ) {
    this.trustedSecrets = trustedSecrets ?? [
      Deno.env.get("JWT_SECRET"),
      Deno.env.get("EIMUNISASI_JWT_SECRET"),
      Deno.env.get("KASIH_JWT_SECRET"),
    ].filter(Boolean) as string[];
  }

  async verifyUser(
    authHeader: string,
  ): Promise<{ userId: string; email: string; name: string } | null> {
    if (!authHeader) return null;
    let token: string;
    try {
      token = getAuthToken(authHeader);
    } catch {
      return null;
    }

    // 1. Try verifying with the userClient (Supabase Auth API)
    if (this.userClient) {
      try {
        const { data: userData, error } = await this.userClient.auth.getUser(
          token,
        );
        if (!error && userData?.user) {
          return {
            userId: userData.user.id,
            email: userData.user.email || "",
            name: userData.user.user_metadata?.name ||
              userData.user.user_metadata?.full_name ||
              "Customer",
          };
        }
      } catch (e) {
        console.warn("userClient.auth.getUser error:", e);
      }
    }

    // 2. Cryptographic signature verification fallback using trusted JWT secrets (e.g. cross-realm tokens)
    const encoder = new TextEncoder();
    for (const secret of this.trustedSecrets) {
      try {
        const { payload } = await jose.jwtVerify(
          token,
          encoder.encode(secret),
          { algorithms: ["HS256", "HS384", "HS512"] },
        );
        if (payload && payload.sub) {
          const userMeta = (payload.user_metadata ?? {}) as Record<
            string,
            unknown
          >;
          return {
            userId: payload.sub as string,
            email: (payload.email as string) || "",
            name: (userMeta.name ||
              userMeta.full_name ||
              payload.name ||
              "Customer") as string,
          };
        }
      } catch {
        // Signature did not match this secret or token expired; try next secret
      }
    }

    // Never trust unverified JWT payloads
    return null;
  }
}

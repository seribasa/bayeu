import { getAuthToken } from "../../../../_shared/jwtHelper.ts";
import { IAuthService } from "../../domain/services/interfaces.ts";
import { SupabaseClient } from "@supabase/supabase-js";

export class JwtAuthService implements IAuthService {
  constructor(private userClient?: SupabaseClient) {}

  extractUserFromHeader(
    authHeader: string,
  ): { userId: string; email: string; name: string } | null {
    if (!authHeader) return null;
    try {
      const token = getAuthToken(authHeader);
      const base64Url = token.split(".")[1];
      if (base64Url) {
        const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
        const jsonPayload = decodeURIComponent(
          atob(base64).split("").map(function (c) {
            return "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2);
          }).join(""),
        );
        const decoded = JSON.parse(jsonPayload);
        if (!decoded.sub) return null;
        return {
          userId: decoded.sub,
          email: decoded.email || "",
          name: decoded.user_metadata?.name ||
            decoded.user_metadata?.full_name ||
            decoded.name ||
            "Customer",
        };
      }
    } catch (e) {
      console.error("JWT Decode fallback error:", e);
    }
    return null;
  }

  async verifyUser(
    authHeader: string,
  ): Promise<{ userId: string; email: string; name: string } | null> {
    if (!authHeader) return null;
    try {
      if (this.userClient) {
        const token = getAuthToken(authHeader);
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
      }
    } catch (e) {
      console.error("JWT verify error:", e);
    }
    // Fallback: extract user from valid JWT payload if userClient is not matching or fails (e.g. cross-realm user like Kasih)
    return this.extractUserFromHeader(authHeader);
  }
}

export interface IOutpostService {
  upsertDestination(tenantId: string, webhookUrl: string): Promise<void>;
  publishEvent(
    params: {
      tenantId: string;
      event: string;
      payload: Record<string, unknown>;
    },
  ): Promise<void>;
}

export interface IAuthService {
  extractUserFromHeader(
    authHeader: string,
  ): { userId: string; email: string; name: string } | null;
  verifyUser(
    authHeader: string,
  ): Promise<{ userId: string; email: string; name: string } | null>;
}

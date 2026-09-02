import { IOutpostService } from "../../domain/services/interfaces.ts";

const OUTPOST_API_URL = Deno.env.get("OUTPOST_API_URL") ||
  "http://outpost:3000";
const OUTPOST_API_KEY = Deno.env.get("OUTPOST_API_KEY");

export class OutpostService implements IOutpostService {
  async publishEvent(
    params: {
      tenantId: string;
      event: string;
      payload: Record<string, unknown>;
    },
  ): Promise<void> {
    if (!OUTPOST_API_KEY) {
      console.warn("OUTPOST_API_KEY is not set. Skipping event publish.");
      return;
    }

    try {
      const response = await fetch(`${OUTPOST_API_URL}/api/v1/publish`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${OUTPOST_API_KEY}`,
        },
        body: JSON.stringify({
          tenant_id: params.tenantId,
          type: params.event,
          data: params.payload,
          ...params.payload,
        }),
      });

      if (!response.ok) {
        console.error(
          `Failed to publish event to Outpost: ${response.statusText}`,
        );
        const body = await response.text();
        console.error(body);
      } else {
        console.log(
          `Successfully published event to Outpost for tenant: ${params.tenantId}`,
        );
      }
    } catch (error) {
      console.error("Error publishing event to Outpost:", error);
    }
  }

  async upsertDestination(tenantId: string, webhookUrl: string): Promise<void> {
    if (!OUTPOST_API_KEY) {
      console.warn("OUTPOST_API_KEY is not set. Skipping destination upsert.");
      return;
    }

    try {
      const url = new URL(webhookUrl);
      if (!["http:", "https:"].includes(url.protocol)) {
        throw new Error("Invalid webhook URL protocol");
      }
      const hostname = url.hostname.toLowerCase();
      if (
        hostname === "localhost" || hostname === "127.0.0.1" ||
        hostname.startsWith("192.168.") ||
        hostname.startsWith("10.") || hostname.startsWith("172.16.") ||
        hostname.startsWith("::1") ||
        hostname === "metadata.google.internal" ||
        hostname.endsWith(".internal")
      ) {
        throw new Error(
          "Webhook URL cannot point to internal/private addresses",
        );
      }
    } catch (error) {
      console.error("Invalid webhook URL:", error);
      throw new Error("Invalid webhook URL");
    }

    try {
      await fetch(`${OUTPOST_API_URL}/api/v1/tenants/${tenantId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${OUTPOST_API_KEY}`,
        },
        body: JSON.stringify({ name: tenantId }),
      });

      const listResponse = await fetch(
        `${OUTPOST_API_URL}/api/v1/tenants/${tenantId}/destinations`,
        { headers: { "Authorization": `Bearer ${OUTPOST_API_KEY}` } },
      );

      if (listResponse.ok) {
        const destinations = await listResponse.json();
        const exists = destinations.find((
          d: Record<string, { url?: string }>,
        ) => d.config && d.config.url === webhookUrl);
        if (exists) {
          console.log(`Destination already exists for tenant: ${tenantId}`);
          return;
        }
      }

      const response = await fetch(
        `${OUTPOST_API_URL}/api/v1/tenants/${tenantId}/destinations`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${OUTPOST_API_KEY}`,
          },
          body: JSON.stringify({
            name: `${tenantId} Webhook Destination`,
            type: "webhook",
            topics: ["payment.success"],
            config: { url: webhookUrl },
          }),
        },
      );

      if (!response.ok) {
        console.error(
          `Failed to create destination in Outpost: ${response.statusText}`,
        );
        const body = await response.text();
        console.error(body);
      } else {
        console.log(`Successfully created destination for tenant: ${tenantId}`);
      }
    } catch (error) {
      console.error("Error upserting destination to Outpost:", error);
    }
  }
}

export const publishPaymentEvent = async (
  tenantId: string,
  payload: Record<string, unknown>,
) => {
  await new OutpostService().publishEvent({
    tenantId,
    event: "payment.success",
    payload,
  });
};

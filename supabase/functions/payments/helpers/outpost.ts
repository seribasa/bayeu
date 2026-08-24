const OUTPOST_API_URL = Deno.env.get("OUTPOST_API_URL") ||
  "http://outpost:3000";
const OUTPOST_API_KEY = Deno.env.get("OUTPOST_API_KEY");

/**
 * Publishes an event to Hookdeck Outpost.
 * Outpost will then route this event to the pre-configured tenant destination.
 */
export async function publishEvent(
  { tenantId, event, payload }: {
    tenantId: string;
    event: string;
    payload: unknown;
  },
) {
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
        tenant_id: tenantId,
        type: event,
        data: payload,
        ...(typeof payload === "object" && payload !== null ? payload : {}),
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
        `Successfully published event to Outpost for tenant: ${tenantId}`,
      );
    }
  } catch (error) {
    console.error("Error publishing event to Outpost:", error);
  }
}

/**
 * Publishes a payment event to Hookdeck Outpost.
 * Outpost will then route this event to the pre-configured tenant destination.
 */
export async function publishPaymentEvent(tenantId: string, payload: unknown) {
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
        tenant_id: tenantId,
        type: "payment.success",
        data: payload,
        ...(typeof payload === "object" && payload !== null ? payload : {}),
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
        `Successfully published event to Outpost for tenant: ${tenantId}`,
      );
    }
  } catch (error) {
    console.error("Error publishing event to Outpost:", error);
  }
}

/**
 * Upserts a destination in Hookdeck Outpost.
 * This is used for tenant registration on startup or upon request.
 */
export async function upsertOutpostDestination(
  tenantId: string,
  destinationUrl: string,
) {
  if (!OUTPOST_API_KEY) {
    console.warn("OUTPOST_API_KEY is not set. Skipping destination upsert.");
    return;
  }

  // Validate webhook URL to prevent SSRF
  try {
    const url = new URL(destinationUrl);
    if (!["http:", "https:"].includes(url.protocol)) {
      throw new Error("Invalid webhook URL protocol");
    }
    // Block internal/private IPs
    const hostname = url.hostname.toLowerCase();
    if (
      hostname === "localhost" || hostname === "127.0.0.1" ||
      hostname.startsWith("192.168.") ||
      hostname.startsWith("10.") || hostname.startsWith("172.16.") ||
      hostname.startsWith("::1") ||
      hostname === "metadata.google.internal" || hostname.endsWith(".internal")
    ) {
      throw new Error("Webhook URL cannot point to internal/private addresses");
    }
  } catch (error) {
    console.error("Invalid webhook URL:", error);
    throw new Error("Invalid webhook URL");
  }
  if (!OUTPOST_API_KEY) {
    console.warn("OUTPOST_API_KEY is not set. Skipping destination upsert.");
    return;
  }

  try {
    // 1. Ensure Tenant exists
    await fetch(`${OUTPOST_API_URL}/api/v1/tenants/${tenantId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OUTPOST_API_KEY}`,
      },
      body: JSON.stringify({ name: tenantId }),
    });

    // 2. Check if destination already exists
    const listResponse = await fetch(
      `${OUTPOST_API_URL}/api/v1/tenants/${tenantId}/destinations`,
      {
        headers: {
          "Authorization": `Bearer ${OUTPOST_API_KEY}`,
        },
      },
    );

    if (listResponse.ok) {
      const destinations = await listResponse.json();
      // deno-lint-ignore no-explicit-any
      const exists = destinations.find((d: any) =>
        d.config && d.config.url === destinationUrl
      );
      if (exists) {
        console.log(`Destination already exists for tenant: ${tenantId}`);
        return; // Nothing to do
      }
    }

    // 3. Create destination
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
          config: {
            url: destinationUrl,
          },
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

import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/testing/asserts.ts";
import { stub, returnsNext } from "https://deno.land/std@0.224.0/testing/mock.ts";
import { publishPaymentEvent, upsertOutpostDestination } from "../../../payments/helpers/outpost.ts";

Deno.test("publishPaymentEvent should send a POST request with correct payload", async () => {
  const originalFetch = globalThis.fetch;
  
  // Set up mock fetch
  const fetchStub = stub(
    globalThis,
    "fetch",
    returnsNext([Promise.resolve(new Response(null, { status: 200 }))])
  );

  try {
    const tenantId = "test-tenant";
    const payload = { amount: 100, currency: "USD" };

    // Since OUTPOST_API_KEY is needed but might not be set in test env, 
    // we ensure the logic is tested by temporarily setting it
    const origKey = Deno.env.get("OUTPOST_API_KEY");
    Deno.env.set("OUTPOST_API_KEY", "test-key");

    await publishPaymentEvent(tenantId, payload);

    assertEquals(fetchStub.calls.length, 1);
    
    const [url, init] = fetchStub.calls[0].args as [string, any];
    assertEquals(init?.method, "POST");
    
    const body = JSON.parse(init?.body as string);
    assertEquals(body.tenant_id, tenantId);
    assertEquals(body.type, "payment.success");
    assertEquals(body.data, payload);

    if (origKey !== undefined) Deno.env.set("OUTPOST_API_KEY", origKey);
    else Deno.env.delete("OUTPOST_API_KEY");
  } finally {
    fetchStub.restore();
  }
});

Deno.test("upsertOutpostDestination should create tenant and destination if they do not exist", async () => {
  const fetchStub = stub(
    globalThis,
    "fetch",
    returnsNext([
      Promise.resolve(new Response(null, { status: 200 })), // Create tenant
      Promise.resolve(new Response(JSON.stringify([]), { status: 200 })), // List destinations (empty)
      Promise.resolve(new Response(null, { status: 200 })), // Create destination
    ])
  );

  try {
    const origKey = Deno.env.get("OUTPOST_API_KEY");
    Deno.env.set("OUTPOST_API_KEY", "test-key");

    await upsertOutpostDestination("test-tenant", "http://webhook.url");

    assertEquals(fetchStub.calls.length, 3);
    
    // First call: create tenant
    assertEquals((fetchStub.calls[0].args[1] as any)?.method, "PUT");
    
    // Second call: list destinations
    assertEquals((fetchStub.calls[1].args[1] as any)?.method, undefined); // default GET or explicit GET
    
    // Third call: create destination
    const createDestCall = fetchStub.calls[2];
    assertEquals((createDestCall.args[1] as any)?.method, "POST");
    const body = JSON.parse((createDestCall.args[1] as any)?.body as string);
    assertEquals(body.config.url, "http://webhook.url");

    if (origKey !== undefined) Deno.env.set("OUTPOST_API_KEY", origKey);
    else Deno.env.delete("OUTPOST_API_KEY");
  } finally {
    fetchStub.restore();
  }
});

import { publishPaymentEvent, upsertOutpostDestination } from "../../helpers/outpost.ts";

Deno.test("publishPaymentEvent - logs warning if OUTPOST_API_KEY is not set", async () => {
  const originalKey = Deno.env.get("OUTPOST_API_KEY");
  Deno.env.delete("OUTPOST_API_KEY");
  try {
    // Should not throw
    await publishPaymentEvent("test_tenant", { test: true });
  } finally {
    if (originalKey !== undefined) {
      Deno.env.set("OUTPOST_API_KEY", originalKey);
    }
  }
});

Deno.test("upsertOutpostDestination - logs warning if OUTPOST_API_KEY is not set", async () => {
  const originalKey = Deno.env.get("OUTPOST_API_KEY");
  Deno.env.delete("OUTPOST_API_KEY");
  try {
    // Should not throw
    await upsertOutpostDestination("test_tenant", "http://test.com");
  } finally {
    if (originalKey !== undefined) {
      Deno.env.set("OUTPOST_API_KEY", originalKey);
    }
  }
});

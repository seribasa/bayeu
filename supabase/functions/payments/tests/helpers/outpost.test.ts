import { assertEquals } from "@std/assert";
import { stub, Stub } from "@std/testing/mock";
import { publishPaymentEvent, upsertOutpostDestination } from "../../helpers/outpost.ts";

Deno.test("Outpost Helper Tests", async (t) => {
  let consoleLogStub: Stub;
  let consoleErrorStub: Stub;

  await t.step("setup", () => {
    // Stub console to prevent cluttering test output
    consoleLogStub = stub(console, "log", () => {});
    consoleErrorStub = stub(console, "error", () => {});
  });

  await t.step("publishPaymentEvent - successful publish", async () => {
    const fetchStub = stub(
      globalThis,
      "fetch",
      () => Promise.resolve(new Response(null, { status: 200 }))
    );

    try {
      await publishPaymentEvent("tenant1", { id: "payment123" });

      assertEquals(fetchStub.calls.length, 1);
      const callArgs = fetchStub.calls[0].args;
      
      assertEquals(typeof callArgs[0], "string");
      if (typeof callArgs[0] === "string") {
        assertEquals(callArgs[0].includes("/api/v1/publish"), true);
      }
      
      const requestInit = callArgs[1] as RequestInit;
      assertEquals(requestInit.method, "POST");
      
      const body = JSON.parse(requestInit.body as string);
      assertEquals(body.tenant_id, "tenant1");
      assertEquals(body.type, "payment.success");
      assertEquals(body.data.id, "payment123");
    } finally {
      fetchStub.restore();
    }
  });

  await t.step("publishPaymentEvent - handles fetch failure gracefully", async () => {
    const fetchStub = stub(
      globalThis,
      "fetch",
      () => Promise.resolve(new Response("Internal Error", { status: 500, statusText: "Internal Server Error" }))
    );

    try {
      await publishPaymentEvent("tenant2", { id: "payment456" });
      assertEquals(fetchStub.calls.length, 1);
      assertEquals(consoleErrorStub.calls.length > 0, true);
    } finally {
      fetchStub.restore();
    }
  });

  await t.step("publishPaymentEvent - handles network throw", async () => {
    const fetchStub = stub(
      globalThis,
      "fetch",
      () => Promise.reject(new Error("Network Error"))
    );

    try {
      await publishPaymentEvent("tenant3", { id: "payment789" });
      assertEquals(fetchStub.calls.length, 1);
      assertEquals(consoleErrorStub.calls.length > 0, true);
    } finally {
      fetchStub.restore();
    }
  });

  await t.step("upsertOutpostDestination - creates destination if not exists", async () => {
    let fetchCallIndex = 0;
    const fetchStub = stub(globalThis, "fetch", () => {
      fetchCallIndex++;
      if (fetchCallIndex === 2) {
        return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
      }
      return Promise.resolve(new Response(null, { status: 200 }));
    });

    try {
      await upsertOutpostDestination("tenant_test", "http://example.com/webhook");

      assertEquals(fetchStub.calls.length, 3);
      
      const postCallArgs = fetchStub.calls[2].args;
      assertEquals(typeof postCallArgs[0], "string");
      const requestInit = postCallArgs[1] as RequestInit;
      assertEquals(requestInit.method, "POST");
      
      const body = JSON.parse(requestInit.body as string);
      assertEquals(body.name, "tenant_test Webhook Destination");
      assertEquals(body.config.url, "http://example.com/webhook");
    } finally {
      fetchStub.restore();
    }
  });

  await t.step("upsertOutpostDestination - skips creation if exists", async () => {
    let fetchCallIndex = 0;
    const fetchStub = stub(globalThis, "fetch", () => {
      fetchCallIndex++;
      if (fetchCallIndex === 2) {
        return Promise.resolve(new Response(JSON.stringify([
          { config: { url: "http://example.com/webhook" } }
        ]), { status: 200 }));
      }
      return Promise.resolve(new Response(null, { status: 200 }));
    });

    try {
      await upsertOutpostDestination("tenant_test_exist", "http://example.com/webhook");
      assertEquals(fetchStub.calls.length, 2);
    } finally {
      fetchStub.restore();
    }
  });

  await t.step("teardown", () => {
    consoleLogStub.restore();
    consoleErrorStub.restore();
  });
});

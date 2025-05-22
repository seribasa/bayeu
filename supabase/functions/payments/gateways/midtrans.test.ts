import { verifyMidtransSignature } from "./midtrans.ts";
import { assertEquals } from "jsr:@std/assert";

Deno.test("verifyMidtransSignature", () => {
  // setup the environment variable

  const signature =
    "e78e2223638cb60dbdbc88d23deb9b927ac41be7263ab38758605bac834dc25425705543707504bfef0802914cfa3f5f538fa308d1f9086211c420e7892ba2ba";

  Deno.env.set("SERVER_KEY", "VT-server-HJMpl9HLr_ntOKt5mRONdmKj");

  const body = {
    order_id: "Postman-1578568851",
    status_code: "200",
    gross_amount: "10000.00",
    server_key: Deno.env.get("SERVER_KEY") || "",
  };

  // Mock the verifyMidtransSignature function
  const result = verifyMidtransSignature({
    signature,
    body,
  });

  // Check if the result is as expected
  assertEquals(result, true);
});

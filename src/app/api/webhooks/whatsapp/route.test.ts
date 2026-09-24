import { createHmac } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/agent/conversation-lifecycle", () => ({ findOpenConversationByPhone: vi.fn().mockResolvedValue("conversation") }));
vi.mock("@/lib/agent/runtime", () => ({ runAgentTurn: vi.fn().mockResolvedValue({ reply: "OK" }) }));
vi.mock("@/lib/agent/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/agent/template-outreach", () => ({ recordOptOutButton: vi.fn() }));
import { POST } from "./route";
import { runAgentTurn } from "@/lib/agent/runtime";
import { recordOptOutButton } from "@/lib/agent/template-outreach";

const body = (phone = "phone-id") => JSON.stringify({ entry: [{ changes: [{ value: {
  metadata: { phone_number_id: phone }, messages: [{ from: "50760000000", id: "wamid.test", type: "text", text: { body: "Hola" } }],
} }] }] });
function request(raw = body(), signed = true) {
  return new Request("https://demo.test/api/webhooks/whatsapp", { method: "POST", body: raw,
    headers: signed ? { "x-hub-signature-256": "sha256=" + createHmac("sha256", "secret").update(raw).digest("hex") } : {} });
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("WHATSAPP_APP_SECRET", "secret");
  vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "phone-id");
});
afterEach(() => vi.unstubAllEnvs());
it("fails closed without the secret", async () => {
  vi.stubEnv("WHATSAPP_APP_SECRET", "");
  expect((await POST(request())).status).toBe(503);
  expect(runAgentTurn).not.toHaveBeenCalled();
});
it("rejects unsigned messages", async () => {
  expect((await POST(request(body(), false))).status).toBe(401);
  expect(runAgentTurn).not.toHaveBeenCalled();
});
it("rejects signed malformed JSON shapes", async () => {
  expect((await POST(request("null"))).status).toBe(400);
  expect((await POST(request('{"entry":42}'))).status).toBe(400);
  expect(runAgentTurn).not.toHaveBeenCalled();
});
it("rejects messages addressed to a different WhatsApp number", async () => {
  expect((await POST(request(body("other-number")))).status).toBe(403);
  expect(runAgentTurn).not.toHaveBeenCalled();
});
it("routes valid signed messages using the external message id", async () => {
  expect((await POST(request())).status).toBe(200);
  expect(runAgentTurn).toHaveBeenCalledWith("conversation", "Hola", { externalMessageId: "wamid.test" });
});
const buttonBody = (text: string) => JSON.stringify({ entry: [{ changes: [{ value: {
  metadata: { phone_number_id: "phone-id" },
  messages: [{ from: "50760000000", id: "wamid.btn", type: "button", button: { text, payload: text } }],
} }] }] });
it("routes a tapped template button to the agent as the customer's reply", async () => {
  expect((await POST(request(buttonBody("Sí, prepárala")))).status).toBe(200);
  expect(runAgentTurn).toHaveBeenCalledWith("conversation", "Sí, prepárala", { externalMessageId: "wamid.btn" });
  expect(recordOptOutButton).not.toHaveBeenCalled();
});
it("records an opt-out, without an agent reply, when the customer taps No me interesa", async () => {
  expect((await POST(request(buttonBody("No me interesa")))).status).toBe(200);
  expect(recordOptOutButton).toHaveBeenCalledWith("conversation", "No me interesa", "wamid.btn");
  expect(runAgentTurn).not.toHaveBeenCalled();
});

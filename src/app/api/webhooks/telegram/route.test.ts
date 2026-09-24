import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { handleMock } = vi.hoisted(() => ({ handleMock: vi.fn() }));

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (task: () => Promise<void>) => task(),
}));
vi.mock("@/lib/agent/owner-telegram", async () => {
  const { z } = await import("zod");
  return { handleTelegramUpdate: handleMock, telegramUpdateSchema: z.object({ update_id: z.number() }).passthrough() };
});
vi.mock("@/lib/agent/audit", () => ({ logAudit: vi.fn() }));

import { POST } from "./route";

const post = (headers: Record<string, string>, body: unknown = { update_id: 1 }) =>
  POST(new Request("https://example.test/api/webhooks/telegram", { method: "POST", headers, body: JSON.stringify(body) }));

describe("Telegram webhook", () => {
  beforeEach(() => {
    handleMock.mockReset();
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "token");
    vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", "s3cret-value");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("rejects deliveries without the registered secret", async () => {
    expect((await post({})).status).toBe(403);
    expect((await post({ "x-telegram-bot-api-secret-token": "wrong" })).status).toBe(403);
    expect(handleMock).not.toHaveBeenCalled();
  });

  it("processes a valid delivery", async () => {
    const response = await post({ "x-telegram-bot-api-secret-token": "s3cret-value" });
    expect(response.status).toBe(200);
    expect(handleMock).toHaveBeenCalledWith({ update_id: 1 });
  });

  it("fails closed when the bot is not configured", async () => {
    vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", "");
    expect((await post({ "x-telegram-bot-api-secret-token": "" })).status).toBe(503);
  });
});

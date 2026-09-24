import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { runMock } = vi.hoisted(() => ({ runMock: vi.fn() }));
vi.mock("@/lib/payments/payments", () => ({ runDuePaymentReminders: runMock }));

import { POST } from "./route";

const post = (authorization?: string) =>
  POST(new Request("https://example.test/api/cron/payment-reminders", { method: "POST", headers: authorization ? { authorization } : {} }));

describe("payment reminders job", () => {
  beforeEach(() => { runMock.mockReset().mockResolvedValue(2); vi.stubEnv("CRON_SECRET", "cron-secret-value"); });
  afterEach(() => vi.unstubAllEnvs());

  it("is disabled until CRON_SECRET is set", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await post("Bearer ")).status).toBe(503);
    expect(runMock).not.toHaveBeenCalled();
  });

  it("rejects calls without the secret", async () => {
    expect((await post()).status).toBe(403);
    expect((await post("Bearer wrong")).status).toBe(403);
    expect(runMock).not.toHaveBeenCalled();
  });

  it("sends the reminders that are due", async () => {
    const response = await post("Bearer cron-secret-value");
    expect(await response.json()).toEqual({ ok: true, sent: 2 });
  });
});

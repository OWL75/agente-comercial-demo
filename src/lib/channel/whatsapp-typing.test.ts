import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { startTyping, stopTyping } = await import("./whatsapp-typing");

describe("WhatsApp 'escribiendo…' while Fernán prepares the reply", () => {
  const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "token");
    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "123");
    fetchMock.mockClear();
  });
  afterEach(() => {
    stopTyping("c1");
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("marks the customer's message as read with a typing indicator", async () => {
    await startTyping("c1", "wamid.ABC");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://graph.facebook.com/v26.0/123/messages");
    expect(JSON.parse(String(init.body))).toEqual({
      messaging_product: "whatsapp",
      status: "read",
      message_id: "wamid.ABC",
      typing_indicator: { type: "text" },
    });
  });

  it("renews it every 20 s while the turn runs (WhatsApp hides it after ~25 s) and stops when the reply goes out", async () => {
    await startTyping("c1", "wamid.ABC");
    await vi.advanceTimersByTimeAsync(41_000);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    stopTyping("c1");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does nothing without WhatsApp credentials or a customer message to answer", async () => {
    await startTyping("c1", null);
    vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "");
    await startTyping("c1", "wamid.ABC");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a failed request never breaks the conversation", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    fetchMock.mockRejectedValueOnce(new Error("network down"));
    await expect(startTyping("c1", "wamid.ABC")).resolves.toBeUndefined();
    await vi.advanceTimersByTimeAsync(0);
    warn.mockRestore();
  });
});

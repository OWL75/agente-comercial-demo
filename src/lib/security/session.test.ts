import { afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("@/lib/auth", () => ({ COOKIE_NAME: "demo_session", expectedSessionValue: vi.fn() }));
import { cookies } from "next/headers";
import { expectedSessionValue } from "@/lib/auth";
import { requireDemoSession } from "./session";

afterEach(() => { vi.unstubAllEnvs(); vi.resetAllMocks(); });
it("fails closed in production without an access password", async () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.mocked(expectedSessionValue).mockResolvedValue(null);
  await expect(requireDemoSession()).rejects.toThrow("no autorizado");
});
it("requires a valid session for mutations even if middleware is bypassed", async () => {
  vi.mocked(expectedSessionValue).mockResolvedValue("expected");
  vi.mocked(cookies).mockResolvedValue({ get: () => ({ value: "wrong" }) } as unknown as Awaited<ReturnType<typeof cookies>>);
  await expect(requireDemoSession()).rejects.toThrow("no autorizado");
});
it("accepts the configured demo session", async () => {
  vi.mocked(expectedSessionValue).mockResolvedValue("expected");
  vi.mocked(cookies).mockResolvedValue({ get: () => ({ value: "expected" }) } as unknown as Awaited<ReturnType<typeof cookies>>);
  await expect(requireDemoSession()).resolves.toBeUndefined();
});

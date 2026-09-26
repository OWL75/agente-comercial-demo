import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLiveHub } from "./hub";

describe("live hub: one shared poller for every open panel", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("tells listeners the current version and every change, reading once per tick for all of them", async () => {
    let version = "v1";
    const read = vi.fn(async () => version);
    const hub = createLiveHub(read, 1000);
    const a: string[] = [];
    const b: string[] = [];
    hub.subscribe((v) => a.push(v));
    hub.subscribe((v) => b.push(v));

    await vi.advanceTimersByTimeAsync(0);
    expect(a).toEqual(["v1"]);
    expect(b).toEqual(["v1"]);
    expect(read).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(a).toEqual(["v1"]);

    version = "v2";
    await vi.advanceTimersByTimeAsync(1000);
    expect(a).toEqual(["v1", "v2"]);
    expect(b).toEqual(["v1", "v2"]);
    expect(read).toHaveBeenCalledTimes(3);
  });

  it("a late subscriber hears the current version at once", async () => {
    const hub = createLiveHub(async () => "v7", 1000);
    hub.subscribe(() => {});
    await vi.advanceTimersByTimeAsync(0);
    const late: string[] = [];
    hub.subscribe((v) => late.push(v));
    expect(late).toEqual(["v7"]);
  });

  it("stops asking the database when nobody is watching", async () => {
    const read = vi.fn(async () => "v1");
    const hub = createLiveHub(read, 1000);
    const unsubscribe = hub.subscribe(() => {});
    await vi.advanceTimersByTimeAsync(0);
    unsubscribe();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(read).toHaveBeenCalledTimes(1);
    expect(hub.size).toBe(0);
  });

  it("keeps polling after a failed read", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    let fail = true;
    const hub = createLiveHub(async () => {
      if (fail) throw new Error("timeout");
      return "v1";
    }, 1000);
    const seen: string[] = [];
    hub.subscribe((v) => seen.push(v));
    await vi.advanceTimersByTimeAsync(0);
    fail = false;
    await vi.advanceTimersByTimeAsync(1000);
    expect(seen).toEqual(["v1"]);
    errors.mockRestore();
  });
});

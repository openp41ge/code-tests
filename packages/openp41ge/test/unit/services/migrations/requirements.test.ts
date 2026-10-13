/**
 * What downloading the data updates needs, checked while the migration
 * window is offline: an internet connection, and GitHub — its API (the
 * release list) and the servers the release files download from — reachable
 * and not refusing this network for too many requests.
 */
import { describe, it, expect, vi } from "vitest";
import {
  checkRequirements,
  requirementsMet,
  type RequirementsProbe,
} from "../../../../src/main/services/migrations/requirements";

const RATE = (remaining: number, reset = 1_760_000_000) =>
  JSON.stringify({ resources: { core: { limit: 60, remaining, reset } } });

function probe(over: Partial<RequirementsProbe> = {}) {
  return {
    isOnline: vi.fn(() => true),
    get: vi.fn(async () => ({ status: 200, text: RATE(42) })),
    reach: vi.fn(async () => undefined),
    ...over,
  } satisfies RequirementsProbe;
}

describe("checkRequirements", () => {
  it("online and GitHub reachable: both met", async () => {
    const p = probe();
    const r = await checkRequirements(p);
    expect(r).toEqual({ internet: true, github: "ok" });
    expect(requirementsMet(r)).toBe(true);
    expect(p.get).toHaveBeenCalledWith("https://api.github.com/rate_limit");
    const reached = p.reach.mock.calls.map((c) => c[0] as string);
    expect(reached).toContain("https://github.com/");
    expect(reached).toContain("https://release-assets.githubusercontent.com/");
  });

  it("no connection: neither is met, and GitHub is not tried", async () => {
    const p = probe({ isOnline: vi.fn(() => false) });
    const r = await checkRequirements(p);
    expect(r).toEqual({ internet: false, github: "unreachable" });
    expect(requirementsMet(r)).toBe(false);
    expect(p.get).not.toHaveBeenCalled();
  });

  it("the API can't be reached: GitHub unreachable", async () => {
    const r = await checkRequirements(probe({ get: vi.fn(async () => Promise.reject(new Error("ENOTFOUND"))) }));
    expect(r).toEqual({ internet: true, github: "unreachable" });
    expect(requirementsMet(r)).toBe(false);
  });

  it("the download servers can't be reached (the API can): GitHub unreachable", async () => {
    const reach = vi.fn(async (url: string) => {
      if (url.includes("githubusercontent")) throw new Error("blocked");
    });
    expect(await checkRequirements(probe({ reach }))).toEqual({ internet: true, github: "unreachable" });
  });

  it("no requests left for this network: rate limited, until GitHub's reset time", async () => {
    const r = await checkRequirements(probe({ get: vi.fn(async () => ({ status: 200, text: RATE(0) })) }));
    expect(r).toEqual({ internet: true, github: "rate-limited", githubResetAt: 1_760_000_000_000 });
    expect(requirementsMet(r)).toBe(false);
  });

  it("GitHub refusing the API (403 / 429): rate limited", async () => {
    for (const status of [403, 429]) {
      const r = await checkRequirements(probe({ get: vi.fn(async () => ({ status, text: "" })) }));
      expect(r).toEqual({ internet: true, github: "rate-limited" });
    }
  });

  it("any other API answer: GitHub unreachable", async () => {
    const r = await checkRequirements(probe({ get: vi.fn(async () => ({ status: 503, text: "" })) }));
    expect(r).toEqual({ internet: true, github: "unreachable" });
  });

  it("the connection is back: says the servers are being checked while they are", async () => {
    const progress = vi.fn();
    const r = await checkRequirements(probe(), { internet: false, github: "unreachable" }, progress);
    expect(progress).toHaveBeenCalledWith({ internet: true, github: "checking" });
    expect(r).toEqual({ internet: true, github: "ok" });
  });

  it("the first check also shows the servers being checked", async () => {
    const progress = vi.fn();
    await checkRequirements(probe(), undefined, progress);
    expect(progress).toHaveBeenCalledWith({ internet: true, github: "checking" });
  });

  it("checking again while connected: no progress (no spinner every few seconds)", async () => {
    const progress = vi.fn();
    await checkRequirements(probe(), { internet: true, github: "unreachable" }, progress);
    expect(progress).not.toHaveBeenCalled();
  });

  it("still being checked is not met", () => {
    expect(requirementsMet({ internet: true, github: "checking" })).toBe(false);
  });
});

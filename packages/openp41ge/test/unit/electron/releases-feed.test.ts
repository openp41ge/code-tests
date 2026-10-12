/**
 * ReleasesFeed — the main process's background check of which releases
 * exist. It fetches only the release list (never a file): at start when the
 * cached list is missing or older than the interval, then every interval, and
 * on demand. The list is cached on disk so it shows at once, and changes are
 * announced to listeners. A failed check keeps the last list and reports the
 * error.
 */
import { describe, it, expect, vi } from "vitest";
import {
  ReleasesFeed,
  RELEASES_CHECK_INTERVAL_MS,
  type ReleasesFeedDeps,
} from "../../../electron/releases-feed";

const rel = (tag: string) => ({
  tag_name: tag,
  name: tag,
  prerelease: tag.includes("-"),
  published_at: "2026-10-12T00:00:00Z",
  body: `notes for ${tag}`,
  html_url: `https://github.com/openp41ge/code/releases/tag/${tag}`,
});

function deps(over: Partial<ReleasesFeedDeps> = {}) {
  let tick: (() => void) | null = null;
  const written: unknown[] = [];
  const d: ReleasesFeedDeps & { written: unknown[]; tick(): void; interval?: number } = {
    fetchList: vi.fn(async () => [rel("v0.1.0-alpha.8")]),
    readCache: () => null,
    writeCache: (c) => written.push(c),
    now: () => 1_000_000_000,
    setInterval: (fn, ms) => {
      tick = fn;
      d.interval = ms;
      return 1;
    },
    clearInterval: () => {
      tick = null;
    },
    written,
    tick: () => tick?.(),
    ...over,
  };
  return d;
}

const settle = () => new Promise((r) => setTimeout(r, 0));

describe("ReleasesFeed", () => {
  it("checks every 6 hours", () => {
    const d = deps();
    new ReleasesFeed(d).start();
    expect(RELEASES_CHECK_INTERVAL_MS).toBe(6 * 60 * 60 * 1000);
    expect(d.interval).toBe(RELEASES_CHECK_INTERVAL_MS);
  });

  it("checks at start with no cache, then caches and announces the list", async () => {
    const d = deps();
    const feed = new ReleasesFeed(d);
    const seen: string[][] = [];
    feed.onChange((s) => seen.push(s.releases.map((r) => r.tag_name)));
    feed.start();
    expect(feed.snapshot().checking).toBe(true);
    await settle();
    expect(d.fetchList).toHaveBeenCalledTimes(1);
    expect(feed.snapshot()).toMatchObject({ checking: false, error: null, fetchedAt: 1_000_000_000 });
    expect(seen.at(-1)).toEqual(["v0.1.0-alpha.8"]);
    expect(d.written).toEqual([{ releases: [rel("v0.1.0-alpha.8")], fetchedAt: 1_000_000_000 }]);
  });

  it("shows a fresh cache at once and does not check at start", () => {
    const d = deps({
      readCache: () => ({ releases: [rel("v0.1.0-alpha.7")], fetchedAt: 1_000_000_000 - 60_000 }),
    });
    const feed = new ReleasesFeed(d);
    feed.start();
    expect(d.fetchList).not.toHaveBeenCalled();
    expect(feed.snapshot()).toMatchObject({ checking: false, fetchedAt: 1_000_000_000 - 60_000 });
    expect(feed.snapshot().releases.map((r) => r.tag_name)).toEqual(["v0.1.0-alpha.7"]);
  });

  it("checks at start when the cache is older than the interval, showing it meanwhile", () => {
    const d = deps({
      readCache: () => ({
        releases: [rel("v0.1.0-alpha.7")],
        fetchedAt: 1_000_000_000 - RELEASES_CHECK_INTERVAL_MS - 1,
      }),
    });
    const feed = new ReleasesFeed(d);
    feed.start();
    expect(d.fetchList).toHaveBeenCalledTimes(1);
    expect(feed.snapshot().releases.map((r) => r.tag_name)).toEqual(["v0.1.0-alpha.7"]);
  });

  it("checks again on each interval tick and on refresh, one check at a time", async () => {
    const d = deps({
      readCache: () => ({ releases: [], fetchedAt: 1_000_000_000 }),
    });
    const feed = new ReleasesFeed(d);
    feed.start();
    d.tick();
    await settle();
    expect(d.fetchList).toHaveBeenCalledTimes(1);
    const a = feed.refresh();
    const b = feed.refresh();
    await Promise.all([a, b]);
    expect(d.fetchList).toHaveBeenCalledTimes(2);
  });

  it("keeps the last list and reports the error when a check fails", async () => {
    const d = deps({
      readCache: () => ({ releases: [rel("v0.1.0-alpha.7")], fetchedAt: 0 }),
      fetchList: vi.fn(async () => {
        throw new Error("offline");
      }),
    });
    const feed = new ReleasesFeed(d);
    feed.start();
    await settle();
    expect(feed.snapshot()).toMatchObject({ checking: false, error: "offline", fetchedAt: 0 });
    expect(feed.snapshot().releases.map((r) => r.tag_name)).toEqual(["v0.1.0-alpha.7"]);
    expect(d.written).toEqual([]);
  });

  it("stops checking when stopped", () => {
    const d = deps({ readCache: () => ({ releases: [], fetchedAt: 1_000_000_000 }) });
    const feed = new ReleasesFeed(d);
    feed.start();
    feed.stop();
    d.tick();
    expect(d.fetchList).not.toHaveBeenCalled();
  });
});

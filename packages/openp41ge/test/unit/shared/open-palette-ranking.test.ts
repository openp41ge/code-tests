// @vitest-environment node
/**
 * Unit tests for the open palette's ranking: how picks are remembered (decayed
 * over a week's half-life, the latest boosted heavily), which tab type a kind
 * opens in by default, and the fuzzy match.
 */

import { describe, it, expect } from "vitest";
import {
  HALF_LIFE_MS,
  MAX_REMEMBERED_ITEMS,
  emptyPaletteHistory,
  frecency,
  fuzzyMatch,
  matchFile,
  orderTabTypes,
  rankScore,
  recordPick,
  recordUse,
} from "../../../src/shared/open-palette-ranking";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const T0 = 1_800_000_000_000;

describe("recordUse / frecency", () => {
  it("adds one per pick, decaying what was there to now", () => {
    const a = recordUse(undefined, T0);
    expect(a).toEqual({ score: 1, at: T0 });
    const b = recordUse(a, T0 + HALF_LIFE_MS);
    expect(b.score).toBeCloseTo(1.5);
    expect(b.at).toBe(T0 + HALF_LIFE_MS);
  });

  it("is zero for nothing remembered", () => {
    expect(frecency(undefined, T0)).toBe(0);
  });

  it("boosts the latest pick heavily, and the boost is gone by the next day", () => {
    const u = recordUse(undefined, T0);
    expect(frecency(u, T0)).toBeCloseTo(51);
    expect(frecency(u, T0 + 30 * MIN)).toBeCloseTo(26, 0);
    const nextDay = frecency(u, T0 + DAY);
    expect(nextDay).toBeGreaterThan(0.85);
    expect(nextDay).toBeLessThan(1);
  });

  it("halves an old score every week", () => {
    const u = { score: 8, at: T0 };
    expect(frecency(u, T0 + 3 * HALF_LIFE_MS)).toBeCloseTo(1, 1);
  });
});

describe("orderTabTypes", () => {
  it("keeps registration order with no history", () => {
    expect(orderTabTypes(["file-viewer", "ext:a:view"], undefined, T0)).toEqual([
      "file-viewer",
      "ext:a:view",
    ]);
  });

  it("puts the most remembered first", () => {
    const usage = { "ext:a:view": recordUse(undefined, T0 - 2 * DAY) };
    expect(orderTabTypes(["file-viewer", "ext:a:view"], usage, T0)).toEqual([
      "ext:a:view",
      "file-viewer",
    ]);
  });

  it("a tab type picked daily for a month, then left for three weeks, loses to two picks today", () => {
    let usage: Record<string, { score: number; at: number }> = {};
    const start = T0 - 51 * DAY;
    for (let d = 0; d < 30; d++) {
      usage = { ...usage, old: recordUse(usage.old, start + d * DAY) };
    }
    // Last "old" pick: 22 days before T0.
    usage = { ...usage, recent: recordUse(usage.recent, T0 - 6 * HOUR) };
    usage = { ...usage, recent: recordUse(usage.recent, T0 - 5 * HOUR) };
    expect(orderTabTypes(["old", "recent"], usage, T0)).toEqual(["recent", "old"]);
  });

  it("the latest pick wins over a heavier history at once", () => {
    let usage: Record<string, { score: number; at: number }> = {};
    for (let d = 0; d < 10; d++) usage = { ...usage, a: recordUse(usage.a, T0 - (10 - d) * DAY) };
    usage = { ...usage, b: recordUse(usage.b, T0 - MIN) };
    expect(orderTabTypes(["a", "b"], usage, T0)).toEqual(["b", "a"]);
  });
});

describe("recordPick", () => {
  it("remembers the tab type under the kind, and the item", () => {
    const h = recordPick(emptyPaletteHistory(), { kind: "k", tabType: "t", item: "k:1" }, T0);
    expect(h.tabTypes.k.t).toEqual({ score: 1, at: T0 });
    expect(h.items["k:1"]).toEqual({ score: 1, at: T0 });
  });

  it("does not change the history it was given", () => {
    const h = emptyPaletteHistory();
    recordPick(h, { kind: "k", tabType: "t", item: "k:1" }, T0);
    expect(h).toEqual(emptyPaletteHistory());
  });

  it("keeps at most MAX_REMEMBERED_ITEMS items, dropping the lowest", () => {
    let h = emptyPaletteHistory();
    for (let i = 0; i < MAX_REMEMBERED_ITEMS + 5; i++) {
      h = recordPick(h, { kind: "k", tabType: "t", item: `k:${i}` }, T0 + i * MIN);
    }
    expect(Object.keys(h.items)).toHaveLength(MAX_REMEMBERED_ITEMS);
    expect(h.items["k:0"]).toBeUndefined();
    expect(h.items[`k:${MAX_REMEMBERED_ITEMS + 4}`]).toBeDefined();
  });
});

describe("fuzzyMatch", () => {
  it("matches everything with an empty query", () => {
    expect(fuzzyMatch("", "anything")).toBe(0);
  });

  it("is null when the query is not a subsequence", () => {
    expect(fuzzyMatch("xyz", "workspace")).toBeNull();
  });

  it("ignores case", () => {
    expect(fuzzyMatch("WS", "workspace settings")).not.toBeNull();
  });

  it("prefers a prefix over a match in the middle", () => {
    expect(fuzzyMatch("log", "logs")!).toBeGreaterThan(fuzzyMatch("log", "catalog")!);
  });

  it("prefers consecutive characters over scattered ones", () => {
    expect(fuzzyMatch("set", "settings")!).toBeGreaterThan(fuzzyMatch("set", "sheet")!);
  });

  it("prefers word and path boundaries", () => {
    expect(fuzzyMatch("ac", "agents-chat.ts")!).toBeGreaterThan(fuzzyMatch("ac", "react.ts")!);
    expect(fuzzyMatch("ft", "src/foo/test.ts")!).toBeGreaterThan(fuzzyMatch("ft", "soft.ts")!);
  });
});

describe("matchFile", () => {
  it("prefers a match in the file's name over one across its folders", () => {
    expect(matchFile("index", "src/index.ts")!).toBeGreaterThan(
      matchFile("index", "src/i/n/d/e/x.ts")!,
    );
  });

  it("matches across folders too", () => {
    expect(matchFile("srcmain", "src/main/app.ts")).not.toBeNull();
  });

  it("is null when nothing matches", () => {
    expect(matchFile("zzz", "src/main/app.ts")).toBeNull();
  });
});

describe("rankScore", () => {
  it("adds remembered use to the match", () => {
    expect(rankScore(10, 0, 0)).toBe(10);
    expect(rankScore(10, 1, 0)).toBe(12);
    expect(rankScore(10, 0, 1)).toBe(11);
  });
});

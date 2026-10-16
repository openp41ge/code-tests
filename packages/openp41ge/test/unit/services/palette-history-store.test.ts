// @vitest-environment node
/**
 * Unit tests for the open palette's history store: one JSON file in the app's
 * data folder that every window shares, read back after a restart, and empty
 * (not an error) when missing or corrupt. Picks accumulate.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FilePaletteHistoryStore } from "@openp41ge/main/services/palette-history-store";

const T0 = 1_800_000_000_000;
let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "palette-history-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("FilePaletteHistoryStore", () => {
  it("is empty when there is no file", () => {
    const store = new FilePaletteHistoryStore(join(dir, "open-palette.json"));
    expect(store.read()).toEqual({ tabTypes: {}, items: {} });
  });

  it("records a pick and reads it back from a new store", () => {
    const file = join(dir, "open-palette.json");
    new FilePaletteHistoryStore(file).record({ kind: "k", tabType: "t", item: "k:1" }, T0);
    expect(new FilePaletteHistoryStore(file).read()).toEqual({
      tabTypes: { k: { t: { score: 1, at: T0 } } },
      items: { "k:1": { score: 1, at: T0 } },
    });
  });

  it("accumulates picks of the same item", () => {
    const store = new FilePaletteHistoryStore(join(dir, "open-palette.json"));
    store.record({ kind: "k", tabType: "t", item: "k:1" }, T0);
    store.record({ kind: "k", tabType: "t", item: "k:1" }, T0);
    expect(store.read().items["k:1"].score).toBe(2);
  });

  it("is empty when the file is corrupt, and replaces it on the next pick", async () => {
    const file = join(dir, "open-palette.json");
    await writeFile(file, "{not json");
    const store = new FilePaletteHistoryStore(file);
    expect(store.read()).toEqual({ tabTypes: {}, items: {} });
    store.record({ kind: "k", tabType: "t", item: "k:1" }, T0);
    expect(JSON.parse(await readFile(file, "utf-8")).items["k:1"].score).toBe(1);
  });
});

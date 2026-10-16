// @vitest-environment node
/**
 * Unit tests for the open palette's model: which tab types each found item
 * can open in (by its kind, the remembered one first), how results rank
 * (match plus remembered use), what an empty query shows (what was opened
 * before), and that new file / new folder rows always come last.
 */
import { describe, it, expect } from "vitest";
import {
  entriesFromHistory,
  entryKey,
  pickFor,
  rankEntries,
  type PaletteCatalog,
  type PaletteEntry,
} from "../../../src/renderer/services/open-palette/model";
import { emptyPaletteHistory, recordPick } from "../../../src/shared/open-palette-ranking";

const T0 = 1_800_000_000_000;

const catalog: PaletteCatalog = {
  tabTypesFor: (kind) =>
    kind === "openp41ge/file"
      ? [
          { id: "file-viewer", label: "File viewer", placement: "grid" },
          { id: "ext:md:preview", label: "Markdown preview", placement: "grid" },
        ]
      : kind === "agents/chat"
        ? [{ id: "ext:agents:chat", label: "Agent", placement: "grid" }]
        : [],
  tabType: (id) =>
    id === "ext:explorer:explorer"
      ? { id, label: "Explorer", placement: "sidebar" }
      : id === "file-viewer"
        ? { id, label: "File viewer", placement: "grid" }
        : null,
};

const file = (relPath: string): PaletteEntry => ({
  type: "open",
  item: {
    kind: "openp41ge/file",
    params: { filePath: `/w/${relPath}` },
    title: relPath.split("/").pop()!,
  },
  matchPath: relPath,
});

const chat = (id: string, title: string): PaletteEntry => ({
  type: "open",
  item: { kind: "agents/chat", params: { chatId: id }, title, key: id },
});

const explorer: PaletteEntry = {
  type: "tab",
  tabType: "ext:explorer:explorer",
  title: "Explorer",
};

describe("rankEntries", () => {
  it("drops what does not match and what nothing opens", () => {
    const ranked = rankEntries(
      [
        file("src/app.ts"),
        chat("c1", "Release notes"),
        { type: "open", item: { kind: "other/x", params: {}, title: "app" } },
      ],
      "app",
      catalog,
      emptyPaletteHistory(),
      T0,
    );
    expect(ranked.map((r) => r.entry)).toEqual([file("src/app.ts")]);
  });

  it("offers every tab type of the kind, in registration order with no history", () => {
    const [r] = rankEntries([file("a.md")], "a", catalog, emptyPaletteHistory(), T0);
    expect(r.tabTypes.map((t) => t.id)).toEqual(["file-viewer", "ext:md:preview"]);
  });

  it("offers the tab type last picked for the kind first", () => {
    const history = recordPick(
      emptyPaletteHistory(),
      { kind: "openp41ge/file", tabType: "ext:md:preview", item: "x" },
      T0 - 1000,
    );
    const [r] = rankEntries([file("a.md")], "a", catalog, history, T0);
    expect(r.tabTypes.map((t) => t.id)).toEqual(["ext:md:preview", "file-viewer"]);
  });

  it("ranks an item opened before above a better match", () => {
    const older = chat("c2", "Notes about apps");
    const history = recordPick(
      emptyPaletteHistory(),
      { kind: "agents/chat", tabType: "ext:agents:chat", item: entryKey(older) },
      T0 - 60_000,
    );
    const ranked = rankEntries([chat("c1", "Apps"), older], "app", catalog, history, T0);
    expect(ranked.map((r) => r.key)).toEqual([entryKey(older), entryKey(chat("c1", "Apps"))]);
  });

  it("offers a tab on its own", () => {
    const [r] = rankEntries([explorer], "expl", catalog, emptyPaletteHistory(), T0);
    expect(r.tabTypes).toEqual([
      { id: "ext:explorer:explorer", label: "Explorer", placement: "sidebar" },
    ]);
  });

  it("puts new file / new folder rows last, whatever matches", () => {
    const newFile: PaletteEntry = {
      type: "create",
      title: "New file app.ts",
      path: { target: "/w/app.ts", what: "file" },
    };
    const ranked = rankEntries(
      [newFile, file("src/zapp.ts")],
      "app.ts",
      catalog,
      emptyPaletteHistory(),
      T0,
    );
    expect(ranked.map((r) => r.entry)).toEqual([file("src/zapp.ts"), newFile]);
  });

  it("ranks a provider's create item by its title", () => {
    const newChat: PaletteEntry = {
      type: "create",
      title: "New chat",
      provider: { extensionId: "agents", providerId: "chats", create: "new-chat" },
    };
    expect(rankEntries([newChat], "new ch", catalog, emptyPaletteHistory(), T0)).toHaveLength(1);
    expect(rankEntries([newChat], "zzz", catalog, emptyPaletteHistory(), T0)).toHaveLength(0);
  });

  it("keeps the first of the same item from two sources", () => {
    const ranked = rankEntries(
      [chat("c1", "One"), chat("c1", "One (again)")],
      "",
      catalog,
      emptyPaletteHistory(),
      T0,
    );
    expect(ranked).toHaveLength(1);
    expect((ranked[0].entry as { item: { title: string } }).item.title).toBe("One");
  });

  it("shows at most `limit`", () => {
    const many = Array.from({ length: 10 }, (_, i) => chat(`c${i}`, `Chat ${i}`));
    expect(rankEntries(many, "", catalog, emptyPaletteHistory(), T0, 3)).toHaveLength(3);
  });
});

describe("pickFor / entriesFromHistory", () => {
  it("remembers an item with what it was, and shows it again for an empty query", () => {
    const entry = chat("c1", "Hello");
    const pick = pickFor(entry, "ext:agents:chat")!;
    expect(pick).toMatchObject({ kind: "agents/chat", tabType: "ext:agents:chat" });
    const history = recordPick(emptyPaletteHistory(), pick, T0);
    expect(entriesFromHistory(history)).toEqual([entry]);
  });

  it("remembers a tab on its own under the empty kind", () => {
    const pick = pickFor(explorer, "ext:explorer:explorer")!;
    expect(pick.kind).toBe("");
    expect(entriesFromHistory(recordPick(emptyPaletteHistory(), pick, T0))).toEqual([explorer]);
  });

  it("does not remember a create row", () => {
    expect(pickFor({ type: "create", title: "New chat" }, "x")).toBeNull();
  });

  it("skips remembered details that are not an entry", () => {
    const history = {
      tabTypes: {},
      items: { junk: { score: 1, at: T0, details: { nope: true } } },
    };
    expect(entriesFromHistory(history)).toEqual([]);
  });
});

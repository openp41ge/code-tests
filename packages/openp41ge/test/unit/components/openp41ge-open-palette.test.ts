// @vitest-environment jsdom
/**
 * The open palette (Cmd+N): typing searches, each result shows the tab type it
 * opens in, ↑/↓ move, Tab switches the tab type, Enter opens (Cmd+Enter in a
 * new column), a create row runs its action, and Escape or a click outside
 * closes with nothing opened. Results from an earlier query are ignored.
 */
import { describe, it, expect, vi } from "vitest";
import {
  Openp41geOpenPalette,
  type OpenPaletteDeps,
} from "@openp41ge/renderer/components/openp41ge-open-palette";
import type { PaletteEntry } from "@openp41ge/renderer/services/open-palette/model";
import { emptyPaletteHistory, recordPick } from "@openp41ge/shared/open-palette-ranking";

const T0 = 1_800_000_000_000;
const flush = () => new Promise((r) => setTimeout(r, 0));

const file = (name: string): PaletteEntry => ({
  type: "open",
  item: { kind: "openp41ge/file", params: { filePath: `/w/${name}` }, title: name },
  matchPath: name,
});
const newChat: PaletteEntry = {
  type: "create",
  title: "New chat",
  provider: { extensionId: "agents", providerId: "chats", create: "new-chat" },
};

async function mount(overrides: Partial<OpenPaletteDeps> = {}) {
  const open = vi.fn();
  const create = vi.fn(async () => undefined);
  const gather = vi.fn(async (_q: string, on: (e: readonly PaletteEntry[]) => void) => {
    on([file("app.ts"), file("readme.md"), newChat]);
  });
  const el = new Openp41geOpenPalette();
  const onclose = vi.fn();
  el.onclose = onclose;
  el.deps = {
    catalog: {
      tabTypesFor: (kind) =>
        kind === "openp41ge/file"
          ? [
              { id: "file-viewer", label: "File viewer", placement: "grid" },
              { id: "ext:md:preview", label: "Preview", placement: "grid" },
            ]
          : [],
      tabType: () => null,
    },
    history: async () => emptyPaletteHistory(),
    gather,
    open,
    create,
    now: () => T0,
    ...overrides,
  };
  document.body.appendChild(el);
  await flush();
  await el.updateComplete;
  return { el, open, create, gather, onclose };
}

const input = (el: HTMLElement) => el.querySelector<HTMLInputElement>(".op-input")!;
const rows = (el: HTMLElement) =>
  [...el.querySelectorAll<HTMLElement>(".op-row")].map((r) => [
    r.querySelector(".op-title")!.textContent,
    r.querySelector(".op-type")!.textContent,
  ]);
const selected = (el: HTMLElement) =>
  el.querySelector('.op-row[aria-selected="true"] .op-title')?.textContent;

async function type(el: Openp41geOpenPalette, text: string) {
  input(el).value = text;
  input(el).dispatchEvent(new Event("input"));
  await flush();
  await el.updateComplete;
}

async function key(el: Openp41geOpenPalette, k: string, init: KeyboardEventInit = {}) {
  input(el).dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, ...init }));
  await el.updateComplete;
}

describe("openp41ge-open-palette", () => {
  it("focuses its field and searches what is typed", async () => {
    const { el, gather } = await mount();
    expect(document.activeElement).toBe(input(el));
    await type(el, "app");
    expect(gather).toHaveBeenLastCalledWith("app", expect.any(Function));
    expect(rows(el)).toEqual([["app.ts", "File viewer"]]);
    el.close();
  });

  it("shows each result's tab type, and Tab switches it", async () => {
    const { el, open } = await mount();
    await type(el, "readme");
    expect(rows(el)).toEqual([["readme.md", "File viewer"]]);
    await key(el, "Tab");
    expect(rows(el)).toEqual([["readme.md", "Preview"]]);
    await key(el, "Tab", { shiftKey: true });
    await key(el, "Tab", { shiftKey: true });
    expect(rows(el)).toEqual([["readme.md", "Preview"]]);
    await key(el, "Enter");
    expect(open).toHaveBeenCalledWith(
      file("readme.md"),
      { id: "ext:md:preview", label: "Preview", placement: "grid" },
      false,
      "readme",
    );
  });

  it("moves the selection with the arrows, and Cmd+Enter opens in a new column", async () => {
    const { el, open, onclose } = await mount();
    await type(el, ".");
    expect(selected(el)).toBe("app.ts");
    await key(el, "ArrowDown");
    expect(selected(el)).toBe("readme.md");
    await key(el, "ArrowDown");
    expect(selected(el)).toBe("app.ts");
    await key(el, "ArrowUp");
    expect(selected(el)).toBe("readme.md");
    await key(el, "Enter", { metaKey: true });
    expect(open.mock.calls[0][0]).toEqual(file("readme.md"));
    expect(open.mock.calls[0][2]).toBe(true);
    expect(onclose).toHaveBeenCalledOnce();
    expect(el.isConnected).toBe(false);
  });

  it("runs a create row's action with the query", async () => {
    const { el, create, open } = await mount();
    await type(el, "new ch");
    expect(rows(el)).toEqual([["New chat", "Create"]]);
    await key(el, "Enter");
    expect(create).toHaveBeenCalledWith(newChat, "new ch");
    expect(open).not.toHaveBeenCalled();
  });

  it("closes on Escape and on a click outside, opening nothing", async () => {
    const a = await mount();
    await key(a.el, "Escape");
    expect(a.el.isConnected).toBe(false);
    expect(a.open).not.toHaveBeenCalled();
    const b = await mount();
    b.el.querySelector(".op-mask")!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(b.el.isConnected).toBe(false);
    expect(b.onclose).toHaveBeenCalledOnce();
  });

  it("leaves no icon space on a result without an icon", async () => {
    const { el } = await mount({
      gather: async (_q, on) =>
        on([
          { type: "open", item: { ...(file("a.ts") as { item: never }).item, icon: "★" } },
          file("b.ts"),
        ] as PaletteEntry[]),
    });
    await type(el, ".ts");
    const icons = Object.fromEntries(
      [...el.querySelectorAll(".op-row")].map((r) => [
        r.querySelector(".op-title")!.textContent,
        r.querySelector(".op-icon")?.textContent ?? null,
      ]),
    );
    expect(icons).toEqual({ "a.ts": "★", "b.ts": null });
    el.close();
  });

  it("does not let other shortcuts see its keys", async () => {
    const { el } = await mount();
    const seen = vi.fn();
    document.addEventListener("keydown", seen);
    await key(el, "ArrowDown");
    document.removeEventListener("keydown", seen);
    expect(seen).not.toHaveBeenCalled();
    el.close();
  });

  it("ignores results that arrive for an earlier query", async () => {
    let late: ((e: readonly PaletteEntry[]) => void) | null = null;
    const { el } = await mount({
      gather: async (q, on) => {
        if (q === "a") late = on;
        else on([file("b.ts")]);
      },
    });
    await type(el, "a");
    await type(el, "b");
    late!([file("a.ts")]);
    await el.updateComplete;
    expect(rows(el)).toEqual([["b.ts", "File viewer"]]);
    el.close();
  });

  it("lists what was opened before when nothing is typed", async () => {
    const history = recordPick(
      emptyPaletteHistory(),
      { kind: "openp41ge/file", tabType: "file-viewer", item: "x", details: { ...file("old.ts") } },
      T0 - 1000,
    );
    const { el } = await mount({ history: async () => history, gather: async () => undefined });
    expect(rows(el)).toEqual([["old.ts", "File viewer"]]);
    el.close();
  });
});

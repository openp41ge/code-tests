/**
 * The Agents sidebar's archive and copy-path: a chat row's context menu
 * copies the chat's folder (its history) and archives or unarchives it; the
 * footer's archive toggle includes archived chats in the list, marked as such.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "lit";
import { ChatsModel } from "@openp41ge-extension-agents/views/chats-model";
import {
  renderChats,
  type ChatsSidebarHost,
} from "@openp41ge-extension-agents/views/chats-sidebar";
import type { ContextMenuEntry } from "openp41ge-sdk";

const flush = () => new Promise((r) => setTimeout(r, 0));

let menus: ContextMenuEntry[][];
let writeText: ReturnType<typeof vi.fn>;

function host(): ChatsSidebarHost & { dispatch: ReturnType<typeof vi.fn> } {
  return {
    dispatch: vi.fn(async (command: string, payload?: Record<string, unknown>) => {
      if (command === "list") {
        const live = [{ id: "a", title: "Alpha", updatedAt: 2, messageCount: 0, toolCallCount: 0 }];
        const old = { id: "z", title: "Zed", updatedAt: 1, archivedAt: 5, messageCount: 0, toolCallCount: 0 };
        return payload?.archived ? [...live, old] : live;
      }
      if (command === "open-chats") return {};
      if (command === "path") return `/data/chat-threads/${payload?.id}`;
      return true;
    }),
    subscribe: () => () => undefined,
    openTab: vi.fn(),
    config: { openEditor: vi.fn() },
    showContextMenu: (_e: MouseEvent, items: readonly ContextMenuEntry[]) => menus.push([...items]),
  };
}

const item = (menu: ContextMenuEntry[], label: string) =>
  menu.find((i) => "label" in i && i.label === label) as { onSelect(): void } | undefined;

beforeEach(() => {
  menus = [];
  writeText = vi.fn(async () => undefined);
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("ChatsModel archive", () => {
  it("includes archived chats while the toggle is on", async () => {
    const h = host();
    const m = new ChatsModel(h, () => undefined);
    m.start();
    await flush();
    expect(m.state.chats?.map((c) => c.id)).toEqual(["a"]);
    expect(m.state.showArchived).toBe(false);

    await m.toggleArchived();
    expect(m.state.showArchived).toBe(true);
    expect(h.dispatch).toHaveBeenCalledWith("list", { archived: true });
    expect(m.state.chats?.map((c) => c.id)).toEqual(["a", "z"]);

    await m.toggleArchived();
    expect(m.state.chats?.map((c) => c.id)).toEqual(["a"]);
  });

  it("archives, unarchives and copies a chat's folder", async () => {
    const h = host();
    const m = new ChatsModel(h, () => undefined);
    await m.archive("a");
    expect(h.dispatch).toHaveBeenCalledWith("archive", { id: "a" });
    await m.unarchive("z");
    expect(h.dispatch).toHaveBeenCalledWith("unarchive", { id: "z" });
    await m.copyPath("a");
    expect(writeText).toHaveBeenCalledWith("/data/chat-threads/a");
  });
});

describe("<agents-chats> archive", () => {
  async function mount(h: ChatsSidebarHost) {
    const box = document.createElement("div");
    document.body.appendChild(box);
    render(renderChats(h), box);
    await flush();
    await flush();
    return box;
  }
  const row = (box: HTMLElement, id: string) =>
    box.querySelector<HTMLElement>(`[data-chat-id="${id}"]`);
  const rightClick = (el: HTMLElement) =>
    el.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));

  it("a row's context menu copies the chat's path and archives it", async () => {
    const h = host();
    const box = await mount(h);
    rightClick(row(box, "a")!);
    expect(menus).toHaveLength(1);
    item(menus[0], "Copy conversation path")!.onSelect();
    await flush();
    expect(writeText).toHaveBeenCalledWith("/data/chat-threads/a");
    item(menus[0], "Archive")!.onSelect();
    expect(h.dispatch).toHaveBeenCalledWith("archive", { id: "a" });
    expect(item(menus[0], "Unarchive")).toBeUndefined();
  });

  it("the archive toggle shows archived chats, marked, which unarchive", async () => {
    const h = host();
    const box = await mount(h);
    const toggle = box.querySelector<HTMLButtonElement>('[aria-label="Show archived chats"]')!;
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    expect(row(box, "z")).toBeNull();

    toggle.click();
    await flush();
    await flush();
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    const archived = row(box, "z")!;
    expect(archived.classList.contains("archived")).toBe(true);
    expect(archived.textContent).toContain("Archived");

    rightClick(archived);
    expect(item(menus[0], "Archive")).toBeUndefined();
    item(menus[0], "Unarchive")!.onSelect();
    expect(h.dispatch).toHaveBeenCalledWith("unarchive", { id: "z" });
  });
});

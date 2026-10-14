/**
 * The top bar's workspace name is a button opening the workspace picker:
 * every workspace (the window's own marked), filtered as you type. Picking
 * one replaces the window's workspace; a red "Close workspace" button closes
 * it. With unsaved files in the window it asks first.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  Openp41geWorkspaceLabel,
  type WorkspaceLabelDeps,
} from "@openp41ge/renderer/components/openp41ge-workspace-label";

const flush = () => new Promise((r) => setTimeout(r, 0));

const WS = [
  { filePath: "/ws/a.openp41ge-workspace", data: { name: "Alpha", repos: [] } },
  { filePath: "/ws/b.openp41ge-workspace", data: { name: "Beta", repos: [] } },
];

function deps(over: Partial<WorkspaceLabelDeps> = {}) {
  return {
    current: () => ({ path: "/ws/a.openp41ge-workspace" as string | null, name: "Alpha" }),
    list: vi.fn(async () => WS as never),
    switchTo: vi.fn(async () => true),
    unsavedFiles: () => 0,
    confirm: vi.fn(async () => true),
    ...over,
  };
}

async function mount(d: ReturnType<typeof deps>) {
  Openp41geWorkspaceLabel.deps = d;
  const el = document.createElement("openp41ge-workspace-label") as Openp41geWorkspaceLabel;
  document.body.appendChild(el);
  await el.updateComplete;
  return el;
}

async function open(el: Openp41geWorkspaceLabel) {
  el.querySelector<HTMLButtonElement>(".wl-button")!.click();
  await flush();
  await el.updateComplete;
}

const items = (el: HTMLElement) =>
  [...el.querySelectorAll<HTMLElement>(".wl-item .wl-item-name")].map((i) => i.textContent?.trim());

afterEach(() => {
  Openp41geWorkspaceLabel.deps = null;
  document.body.innerHTML = "";
});

describe("workspace label and picker", () => {
  it("shows the window's workspace name as a button", async () => {
    const el = await mount(deps());
    // Just the name: no icon or caret.
    expect(el.querySelector(".wl-button")?.textContent?.trim()).toBe("Alpha");
  });

  it("lists every workspace, the window's own marked", async () => {
    const el = await mount(deps());
    await open(el);
    expect(items(el)).toEqual(["Alpha", "Beta"]);
    // The window's own workspace carries an ACTIVE pill (not a check mark).
    const current = el.querySelector<HTMLElement>(".wl-item--current")!;
    expect(current.querySelector(".wl-item-name")?.textContent?.trim()).toBe("Alpha");
    expect(current.querySelector(".wl-active")?.textContent?.trim()).toBe("ACTIVE");
    expect(el.querySelectorAll(".wl-active")).toHaveLength(1);
    const css = document.head.querySelector("style[data-openp41ge-workspace-label]")!.textContent!;
    expect(css).not.toMatch(/✓/);
  });

  it("offers to close the window's workspace with a button, not a row", async () => {
    const el = await mount(deps());
    await open(el);
    const close = el.querySelector<HTMLButtonElement>("button.wl-close");
    expect(close?.textContent?.trim()).toBe("Close workspace");
    expect(close?.closest(".wl-list")).toBeNull();
  });

  it("the close button is full width but still a button: inset, rounded, no separator, a faded red", async () => {
    const el = await mount(deps());
    await open(el);
    const css = document.head.querySelector("style[data-openp41ge-workspace-label]")!.textContent!;
    const rule = (sel: string) =>
      css.match(new RegExp(`${sel.replace(/[.]/g, "\\.")}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
    expect(rule("openp41ge-workspace-label .wl-foot")).not.toMatch(/border/);
    expect(rule("openp41ge-workspace-label .wl-foot")).toMatch(/padding:\s*8px/);
    const button = rule("openp41ge-workspace-label .wl-close");
    expect(button).toMatch(/width:\s*100%/);
    expect(button).toMatch(/border-radius:\s*5px/);
    // Faded: the theme's error red mixed down, never the full-strength red.
    expect(button).toMatch(/color-mix\(in srgb, var\(--accent-error/);
    expect(button).not.toMatch(/(^|;)\s*color:\s*var\(--accent-error/);
  });

  it("a window with no workspace offers no close button", async () => {
    const el = await mount(deps({ current: () => ({ path: null, name: "No workspace" }) }));
    await open(el);
    expect(items(el)).toEqual(["Alpha", "Beta"]);
    expect(el.querySelector(".wl-close")).toBeNull();
  });

  it("filters as you type", async () => {
    const el = await mount(deps());
    await open(el);
    const input = el.querySelector<HTMLInputElement>(".wl-filter")!;
    input.value = "bet";
    input.dispatchEvent(new Event("input"));
    await el.updateComplete;
    expect(items(el)).toEqual(["Beta"]);
  });

  it("picking a workspace replaces the window's", async () => {
    const d = deps();
    const el = await mount(d);
    await open(el);
    [...el.querySelectorAll<HTMLElement>(".wl-item")][1].click();
    await flush();
    expect(d.switchTo).toHaveBeenCalledWith("/ws/b.openp41ge-workspace");
    expect(d.confirm).not.toHaveBeenCalled();
  });

  it("Close workspace closes the window's workspace", async () => {
    const d = deps();
    const el = await mount(d);
    await open(el);
    el.querySelector<HTMLButtonElement>("button.wl-close")!.click();
    await flush();
    expect(d.switchTo).toHaveBeenCalledWith(null);
  });

  it("picking the window's own workspace just closes the picker", async () => {
    const d = deps();
    const el = await mount(d);
    await open(el);
    el.querySelector<HTMLElement>(".wl-item--current")!.click();
    await flush();
    await el.updateComplete;
    expect(d.switchTo).not.toHaveBeenCalled();
    expect(el.querySelector(".wl-panel")).toBeNull();
  });

  it("asks before replacing a workspace with unsaved files, and keeps it on cancel", async () => {
    const d = deps({ unsavedFiles: () => 2, confirm: vi.fn(async () => false) });
    const el = await mount(d);
    await open(el);
    [...el.querySelectorAll<HTMLElement>(".wl-item")][1].click();
    await flush();
    expect(d.confirm).toHaveBeenCalledTimes(1);
    expect(d.switchTo).not.toHaveBeenCalled();
  });

  it("switches once the user agrees to lose unsaved files", async () => {
    const d = deps({ unsavedFiles: () => 1 });
    const el = await mount(d);
    await open(el);
    [...el.querySelectorAll<HTMLElement>(".wl-item")][1].click();
    await flush();
    await flush();
    expect(d.switchTo).toHaveBeenCalledWith("/ws/b.openp41ge-workspace");
  });

  it("Escape closes the picker", async () => {
    const el = await mount(deps());
    await open(el);
    el.querySelector(".wl-filter")!.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    await el.updateComplete;
    expect(el.querySelector(".wl-panel")).toBeNull();
  });
});

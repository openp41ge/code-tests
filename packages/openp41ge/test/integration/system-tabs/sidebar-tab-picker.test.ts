/**
 * The sidebar's + opens the tab picker: a filter field at the top (as the
 * title bar's workspace picker has), then the sidebar tabs in groups —
 * System (built in, needs no workspace), Workspace (needs one), Logs — in
 * that order, never named after an extension. A tab type may name its group;
 * otherwise its workspace need decides. Typing filters (empty groups hide);
 * Enter opens the first match; a row opens its tab on this sidebar's side.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { registerSystemTabType } from "@openp41ge/renderer/apps/app-registry";
import { registerManagementSidebarTabs } from "@openp41ge/renderer/apps/management/index";
import { registerLogSidebarTabs } from "@openp41ge/renderer/apps/log-viewer/sidebar-tabs";
import "@openp41ge/renderer/components/openp41ge-sidebar";

const ORIG: unknown = window.openp41ge;

type SidebarEl = HTMLElement & {
  side: "left" | "right";
  windowId: string;
  isOpen: boolean;
  updateComplete: Promise<unknown>;
  _onAddTabClick(): void;
};

type PickerEl = HTMLElement & { updateComplete: Promise<unknown> };

let dispatch: ReturnType<typeof vi.fn>;

beforeEach(() => {
  registerManagementSidebarTabs();
  registerLogSidebarTabs();
  registerSystemTabType({
    id: "ext:openp41ge-extension-explorer:explorer",
    label: "Explorer",
    icon: "",
    description: "",
    defaultSide: "left",
    createController: () => ({}) as never,
  });
  dispatch = vi.fn();
  (window as unknown as { openp41ge: unknown }).openp41ge = {
    workspace: { dispatch, getWorkspacePath: () => "/ws/a.openp41ge-workspace" },
  };
});

afterEach(() => {
  (window as unknown as { openp41ge: unknown }).openp41ge = ORIG;
  document.body.innerHTML = "";
});

async function openPicker(side: "left" | "right" = "left"): Promise<PickerEl> {
  const sidebar = document.createElement("openp41ge-sidebar") as SidebarEl;
  sidebar.side = side;
  sidebar.windowId = "w";
  sidebar.isOpen = true;
  document.body.appendChild(sidebar);
  await sidebar.updateComplete;
  sidebar._onAddTabClick();
  const picker = document.querySelector("openp41ge-sidebar-tab-picker") as PickerEl;
  await picker.updateComplete;
  return picker;
}

/** [heading, [row labels]] per shown group. */
function groups(picker: HTMLElement): Array<[string, string[]]> {
  return [...picker.querySelectorAll<HTMLElement>(".stp-group")].map((g) => [
    g.querySelector(".stp-heading")!.textContent!.trim(),
    [...g.querySelectorAll<HTMLElement>(".stp-row .stp-label")].map((r) => r.textContent!.trim()),
  ]);
}

async function type(picker: PickerEl, text: string): Promise<void> {
  const input = picker.querySelector<HTMLInputElement>(".stp-filter")!;
  input.value = text;
  input.dispatchEvent(new Event("input"));
  await picker.updateComplete;
}

describe("sidebar tab picker", () => {
  it("has a filter field at the top, focused", async () => {
    const picker = await openPicker();
    const input = picker.querySelector<HTMLInputElement>(".stp-filter")!;
    expect(input).not.toBeNull();
    expect(picker.querySelector(".stp-panel")!.firstElementChild).toBe(input);
    expect(document.activeElement).toBe(input);
  });

  it("groups the tabs as System, Workspace, Logs, never by extension", async () => {
    const picker = await openPicker();
    expect(groups(picker)).toEqual([
      ["System", ["Workspaces", "Settings", "Releases", "Cleanup", "Migrations"]],
      ["Workspace", ["Explorer"]],
      ["Logs", ["Log Streams", "Log Search"]],
    ]);
    expect(picker.textContent).not.toMatch(/extension/i);
  });

  it("filters as you type; groups with no match are hidden", async () => {
    const picker = await openPicker();
    await type(picker, "log");
    expect(groups(picker)).toEqual([["Logs", ["Log Streams", "Log Search"]]]);
    await type(picker, "zzz");
    expect(groups(picker)).toEqual([]);
    expect(picker.querySelector(".stp-empty")).not.toBeNull();
  });

  it("a row opens its tab on this sidebar's side and closes the picker", async () => {
    const picker = await openPicker("right");
    const row = [...picker.querySelectorAll<HTMLElement>(".stp-row")].find(
      (r) => r.querySelector(".stp-label")!.textContent!.trim() === "Settings",
    )!;
    row.click();
    expect(dispatch).toHaveBeenCalledWith("openSystemTab", "w", "right", "settings", "Settings");
    expect(document.querySelector("openp41ge-sidebar-tab-picker")).toBeNull();
  });

  it("Enter opens the first match; Escape closes", async () => {
    const picker = await openPicker();
    await type(picker, "expl");
    picker
      .querySelector(".stp-filter")!
      .dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(dispatch).toHaveBeenCalledWith(
      "openSystemTab",
      "w",
      "left",
      "ext:openp41ge-extension-explorer:explorer",
      "Explorer",
    );

    const again = await openPicker();
    again
      .querySelector(".stp-filter")!
      .dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(document.querySelector("openp41ge-sidebar-tab-picker")).toBeNull();
  });
});

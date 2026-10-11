/**
 * The ＋ (add) button on a sidebar tab bar must open the chosen system tab on
 * the **sidebar that hosts the ＋** — its own `side` — not the tab type's
 * `defaultSide`. `defaultSide` is still honoured by callers that pass no side
 * (keyboard shortcuts, programmatic opens), which is unchanged.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";

import "../../../src/renderer/components/openp41ge-sidebar";
import { registerSystemTabType } from "../../../src/renderer/apps/app-registry";

/** A sidebar tab type that opens on the right by default. */
const PANEL = "ext:demo:panel";

describe("Sidebar ＋ open-tab menu targets the hosting sidebar", () => {
  let host: HTMLElement;
  const ORIG_OPENP41GE: unknown = window.openp41ge;
  let dispatch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    registerSystemTabType({
      id: PANEL,
      label: "Panel",
      icon: "P",
      description: "Panel",
      defaultSide: "right",
      createController: () => ({}) as never,
    });
    host = document.createElement("div");
    document.body.appendChild(host);
    dispatch = vi.fn();
    (window as unknown as { openp41ge: unknown }).openp41ge = {
      workspace: { dispatch },
    };
  });

  afterEach(() => {
    (window as unknown as { openp41ge: unknown }).openp41ge = ORIG_OPENP41GE;
    host.remove();
    // Each `_onAddTabClick` appends a fresh <openp41ge-contextmenu> to
    // document.body; clean them up so a later test doesn't re-read a stale one.
    for (const menu of document.querySelectorAll("openp41ge-contextmenu")) menu.remove();
  });

  type SidebarEl = HTMLElement & {
    side: "left" | "right";
    windowId: string;
    systemTabs: Array<{ id: string; title: string; appType: string; pinned: boolean }>;
    isOpen: boolean;
    updateComplete: Promise<unknown>;
    _onAddTabClick(): void;
  };

  /** Render a mounted sidebar (its `＋` `.sidebar-tab-add` button is always in the template). */
  async function makeSidebar(side: "left" | "right"): Promise<SidebarEl> {
    const sidebar = document.createElement("openp41ge-sidebar") as SidebarEl;
    sidebar.side = side;
    sidebar.windowId = "w";
    sidebar.isOpen = true;
    host.appendChild(sidebar);
    await sidebar.updateComplete;
    return sidebar;
  }

  /**
   * Open the ＋ menu, find the "Panel" item (registered `defaultSide: "right"`),
   * and run its action.
   */
  function clickPanel(sidebar: SidebarEl): void {
    sidebar._onAddTabClick();
    const menu = document.querySelector("openp41ge-contextmenu") as unknown as {
      items: Array<{ label?: string; action?: () => void }>;
    };
    const item = menu.items.find((i) => i.label === "Panel");
    expect(item, "menu should list the Panel tab").toBeDefined();
    item?.action?.();
  }

  it("opens a tab on the LEFT sidebar whose ＋ was clicked (not its right default)", async () => {
    const sidebar = await makeSidebar("left");
    clickPanel(sidebar);

    expect(dispatch).toHaveBeenCalledWith("openSystemTab", "w", "left", PANEL, "Panel");
  });

  it("opens a tab on the RIGHT sidebar whose ＋ was clicked", async () => {
    const sidebar = await makeSidebar("right");
    clickPanel(sidebar);

    expect(dispatch).toHaveBeenCalledWith("openSystemTab", "w", "right", PANEL, "Panel");
  });
});

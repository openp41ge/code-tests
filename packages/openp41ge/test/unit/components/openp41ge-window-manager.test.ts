/**
 * Unit tests for the Window Manager window: its sidebar tabs, the Workspaces
 * tab's rows opening workspace editors in its grid (the list itself is
 * <openp41ge-workspaces-list>, tested on its own), row drags into the grid,
 * the grid surface and the window chrome.
 *
 * The window's IPC (`window.openp41ge.*`) is stubbed.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Openp41geWindowManager } from "../../../src/renderer/components/openp41ge-window-manager";
import { settingsIcon } from "../../../src/renderer/icons";


// Each manager window remembers its sidebar tabs in localStorage; start every
// test from none.
beforeEach(() => localStorage.clear());

type Wm = Openp41geWindowManager & Record<string, unknown>;

function stubWindow(): {
  dragStart: ReturnType<typeof vi.fn>;
  dragActivate: ReturnType<typeof vi.fn>;
  dragMove: ReturnType<typeof vi.fn>;
  dragEnd: ReturnType<typeof vi.fn>;
  openWorkspaceWindow: ReturnType<typeof vi.fn>;
} {
  const dragStart = vi.fn();
  const dragActivate = vi.fn();
  const dragMove = vi.fn();
  const dragEnd = vi.fn();
  const openWorkspaceWindow = vi.fn();
  (window as unknown as { openp41ge: unknown }).openp41ge = {
    drag: {
      start: dragStart,
      activate: dragActivate,
      move: dragMove,
      end: dragEnd,
      prepareBitmap: vi.fn(),
      onEndSession: vi.fn(() => () => {}),
    },
    windowManager: {
      openWindowSummaries: vi.fn().mockResolvedValue([]),
      onOpenWindowsChanged: vi.fn(() => () => {}),
      openWorkspaceWindow,
      onActivateTab: vi.fn(() => () => {}),
    },
    workspace: {
      getLaunchTab: vi.fn(() => null),
    },
    welcome: {
      isDismissed: vi.fn().mockResolvedValue(false),
    },
    dialog: {
      writeWorkspaceFile: vi.fn().mockResolvedValue(true),
      listWorkspaces: vi.fn().mockResolvedValue([]),
    },
  };
  return { dragStart, dragActivate, dragMove, dragEnd, openWorkspaceWindow };
}

describe("Openp41geWindowManager workspace row thumbnails", () => {
  let wm: Wm;
  let drags: ReturnType<typeof stubWindow>;

  beforeEach(() => {
    drags = stubWindow();
    wm = new Openp41geWindowManager() as Wm;
    document.body.appendChild(wm as unknown as HTMLElement);
  });

  afterEach(() => {
    wm.remove();
  });

  const listEl = () =>
    wm.shadowRoot!.querySelector("openp41ge-workspaces-list") as unknown as HTMLElement & {
      updateComplete: Promise<unknown>;
    };
  const listUpdated = async () => {
    await (wm as Wm).updateComplete;
    await listEl().updateComplete;
  };

  /** Open the Workspaces list's new-workspace row (its + button). */
  async function openAddRow(): Promise<void> {
    await listUpdated();
    listEl().querySelector<HTMLButtonElement>('[aria-label="New workspace"]')!.click();
    await listUpdated();
  }

  /** Show one workspace, "Alpha", in the Workspaces tab's list. */
  async function setWorkspace(windows: number): Promise<void> {
    await (wm as Wm).updateComplete;
    const list = wm.shadowRoot!.querySelector("openp41ge-workspaces-list") as unknown as {
      deps: unknown;
      reload(): Promise<void>;
      updateComplete: Promise<unknown>;
    };
    list.deps = {
      list: async () => [
        {
          filePath: "/w/a",
          data: { name: "Alpha", windows: Array.from({ length: windows }, () => ({})) },
        },
      ],
      create: async () => undefined,
      delete: async () => undefined,
      onChanged: () => () => undefined,
    };
    await list.reload();
    await list.updateComplete;
  }

  it("renders the bottom bar inside the Workspaces tab pane, not the window", async () => {
    await (wm as Wm).updateComplete;
    // The list footer is part of the tab content (inside the pane scoped to the
    // Workspaces tab), NOT a window-level bar that changes with tab activation.
    expect(wm.shadowRoot?.querySelector(".wm-workspaces-pane .ws-list-footer")).not.toBeNull();
    expect(wm.shadowRoot?.querySelector(".wm-root > .ws-list-footer")).toBeNull();
  });

  it("keeps the footer's last button square (no extra right padding: the sidebar is not at the window edge)", async () => {
    await (wm as Wm).updateComplete;
    // jsdom does not cascade the shadow styles, so read the rules themselves.
    const css = [...(wm.shadowRoot?.querySelectorAll("style") ?? [])]
      .map((s) => s.textContent ?? "")
      .join("\n");
    expect(css).not.toMatch(/\.ws-list-footer\s*>\s*:last-child\s*\{[^}]*padding-right/);
  });

  it("does not render a Logs button in the title bar (logs live in the app menu)", async () => {
    await (wm as Wm).updateComplete;
    expect(wm.shadowRoot?.querySelector<HTMLButtonElement>(".wm-open-logs")).toBeNull();
  });

  it("gives the Settings sidebar tab the settings gear", async () => {
    (wm as Wm)._openTabs = ["workspaces", "settings"];
    await (wm as Wm).updateComplete;
    const icon = wm.shadowRoot?.querySelector('[data-manager-tab="settings"] .wm-tab-icon');
    expect(icon?.innerHTML).toContain(settingsIcon(16).slice(0, 60));
  });

  it("shows the list of settings in the Settings pane, without the workspaces footer", async () => {
    (wm as Wm)._activeTab = "settings";
    await (wm as Wm).updateComplete;
    expect(
      wm.shadowRoot?.querySelector(".wm-settings-pane openp41ge-settings-list"),
    ).not.toBeNull();
    expect(wm.shadowRoot?.querySelector(".wm-workspaces-pane .ws-list-footer")).toBeNull();
    expect(wm.shadowRoot?.querySelector(".wm-root > .ws-list-footer")).toBeNull();
  });

  it("opens a chosen settings schema as a settings editor tab in the grid", async () => {
    (wm as Wm)._activeTab = "settings";
    await (wm as Wm).updateComplete;
    const grid = wm.shadowRoot?.querySelector("openp41ge-manager-grid") as unknown as {
      openApp: ReturnType<typeof vi.fn>;
    };
    grid.openApp = vi.fn();
    const list = wm.shadowRoot?.querySelector("openp41ge-settings-list") as unknown as {
      onOpen: (id: string, pinned: boolean) => void;
    };
    list.onOpen("openp41ge-extension-explorer", true);
    expect(grid.openApp).toHaveBeenCalledWith(
      "config-editor",
      "Explorer Settings",
      { extensionId: "openp41ge-extension-explorer", path: "config:openp41ge-extension-explorer" },
      undefined,
      true,
    );
  });

  it("does not render window skeletons in the workspace rows", async () => {
    await setWorkspace(4);
    await (wm as Wm).updateComplete;

    expect(wm.shadowRoot?.querySelectorAll(".ws-thumb")?.length).toBe(0);
    expect(wm.shadowRoot?.querySelector(".ws-more")).toBeNull();
    expect(wm.shadowRoot?.querySelector(".ws-thumbs")).toBeNull();
    // The edit affordance is gone — the row itself opens the editor cell.
    expect(wm.shadowRoot?.querySelector(".ws-edit")).toBeNull();
  });

  it("shows no window skeletons even when the workspace has windows", async () => {
    await setWorkspace(3);
    await (wm as Wm).updateComplete;

    expect(wm.shadowRoot?.querySelectorAll(".ws-thumb")?.length).toBe(0);
    expect(wm.shadowRoot?.querySelector(".ws-more")).toBeNull();
    expect(wm.shadowRoot?.querySelector(".ws-name")?.textContent?.trim()).toBe("Alpha");
  });

  it("does not open the workspace on a single row click", async () => {
    await setWorkspace(1);
    await (wm as Wm).updateComplete;

    const row = wm.shadowRoot?.querySelector(".ws-row");
    row?.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));

    expect(
      (
        window as unknown as {
          openp41ge: { windowManager: { openWorkspaceWindow: ReturnType<typeof vi.fn> } };
        }
      ).openp41ge.windowManager.openWorkspaceWindow,
    ).not.toHaveBeenCalled();
  });

  it("has no open-window button on the row (it is in the workspace editor)", async () => {
    await setWorkspace(1);
    await (wm as Wm).updateComplete;

    expect(wm.shadowRoot?.querySelector(".ws-row")).not.toBeNull();
    expect(wm.shadowRoot?.querySelector(".ws-open-btn")).toBeNull();
    expect(wm.shadowRoot?.querySelector('[aria-label="Open workspace window"]')).toBeNull();
  });

  it("pads workspace rows like the Releases tab's rows (7px 10px)", async () => {
    await (wm as Wm).updateComplete;
    const css = [...(wm.shadowRoot?.querySelectorAll("style") ?? [])]
      .map((s) => s.textContent ?? "")
      .join("\n");
    expect(css).toMatch(/li\.ws-row\s*\{[^}]*padding:\s*7px 10px;/);
  });

  it("no longer opens the workspace window on a row double-click", async () => {
    await setWorkspace(1);
    await (wm as Wm).updateComplete;

    const row = wm.shadowRoot?.querySelector(".ws-row");
    row?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, composed: true }));

    expect(
      (
        window as unknown as {
          openp41ge: { windowManager: { openWorkspaceWindow: ReturnType<typeof vi.fn> } };
        }
      ).openp41ge.windowManager.openWorkspaceWindow,
    ).not.toHaveBeenCalled();
  });

  it("no longer renders the edit button on a workspace row", async () => {
    await setWorkspace(1);
    await (wm as Wm).updateComplete;

    // The per-row edit affordance is removed: the row itself opens the editor.
    expect(wm.shadowRoot?.querySelector<HTMLElement>(".ws-edit")).toBeNull();
    expect(wm.shadowRoot?.querySelector<HTMLElement>(".ws-row")).not.toBeNull();
  });

  it("opens a workspace-editor grid cell on a row click, without opening the window", async () => {
    await setWorkspace(1);
    await (wm as Wm).updateComplete;

    const row = wm.shadowRoot?.querySelector<HTMLElement>(".ws-row")!;
    row.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));

    const om = (
      window as unknown as {
        openp41ge: { windowManager: { openWorkspaceWindow: ReturnType<typeof vi.fn> } };
      }
    ).openp41ge.windowManager.openWorkspaceWindow;
    expect(om).not.toHaveBeenCalled();

    const grid = wm.shadowRoot?.querySelector<HTMLElement>("openp41ge-manager-grid")!;
    const tabs = (
      grid as unknown as { _tabs: Array<{ appType: string; config?: Record<string, unknown> }> }
    )._tabs;
    expect(tabs).toHaveLength(1);
    expect(tabs[0].appType).toBe("ext:openp41ge-extension-workspaces:workspace-editor");
    expect(tabs[0].config?.path).toBe("/w/a");
    // Let the grid re-render (its `updated()` fires `manager-grid-change`),
    // then the manager updates its placeholder flag.
    await (grid as unknown as { updateComplete: Promise<unknown> }).updateComplete;
    await (wm as Wm).updateComplete;
    // The opened workspace editor cell renders a content pane — the empty
    // "no tabs" grid state is replaced.
    const tabGrid = grid.shadowRoot?.querySelector<HTMLElement>("tab-grid")!;
    expect(tabGrid.querySelector(".tab-content-pane")).not.toBeNull();
    expect(tabGrid.querySelector(".tab-content-empty")).toBeNull();
  });

  it("pins the workspace-editor grid cell on a row double-click", async () => {
    await setWorkspace(1);
    await (wm as Wm).updateComplete;

    const row = wm.shadowRoot?.querySelector<HTMLElement>(".ws-row")!;
    const grid = wm.shadowRoot?.querySelector<HTMLElement>("openp41ge-manager-grid")!;
    const getTabs = () =>
      (
        grid as unknown as {
          _tabs: Array<{ appType: string; config?: Record<string, unknown>; pinned?: boolean }>;
        }
      )._tabs;

    row.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
    expect(getTabs()).toHaveLength(1);
    // A single click opens an unpinned (preview) cell.
    expect(getTabs()[0].pinned).toBe(false);

    // Double-tap promotes the same cell to pinned (still a single cell).
    row.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, composed: true }));
    expect(getTabs()).toHaveLength(1);
    expect(getTabs()[0].pinned).toBe(true);
    expect(getTabs()[0].appType).toBe("ext:openp41ge-extension-workspaces:workspace-editor");
    expect(getTabs()[0].config?.path).toBe("/w/a");
  });

  it("pins the workspace-editor cell on the first interaction with its content", async () => {
    await setWorkspace(1);
    await (wm as Wm).updateComplete;

    const row = wm.shadowRoot?.querySelector<HTMLElement>(".ws-row")!;
    const grid = wm.shadowRoot?.querySelector<HTMLElement>("openp41ge-manager-grid")!;
    const getTabs = () =>
      (
        grid as unknown as {
          _tabs: Array<{ id: string; pinned?: boolean }>;
        }
      )._tabs;

    // Single click opens an unpinned (preview) cell.
    row.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
    expect(getTabs()).toHaveLength(1);
    expect(getTabs()[0].pinned).toBe(false);

    // Let the async `_mountControllers` build the content container.
    await (grid as unknown as { updateComplete: Promise<unknown> }).updateComplete;
    await (wm as Wm).updateComplete;

    const tabId = getTabs()[0].id;
    const mounts = (
      grid as unknown as {
        _mounts: Map<string, { container: HTMLElement }>;
      }
    )._mounts;
    // The async `_mountControllers` builds the tab's content container. Wait
    // (bounded) for it so the interaction listeners on the container exist.
    if (!mounts.has(tabId)) {
      await new Promise<void>((resolve) => {
        const start = Date.now();
        const tick = (): void => {
          if (mounts.has(tabId) || Date.now() - start > 2000) resolve();
          else setTimeout(tick, 10);
        };
        tick();
      });
    }
    const container = mounts.get(tabId)?.container;
    expect(container).toBeDefined();

    // Any interaction inside the editor content promotes the preview tab in
    // place (no new tab/column is created).
    container!.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    expect(getTabs()).toHaveLength(1);
    expect(getTabs()[0].pinned).toBe(true);

    // Pinning is idempotent: further interactions keep a single pinned tab.
    container!.dispatchEvent(new InputEvent("input", { bubbles: true }));
    container!.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true }));
    expect(getTabs()).toHaveLength(1);
    expect(getTabs()[0].pinned).toBe(true);
  });

  it("opens a workspace-editor cell pinned from an open-tab drop with pinned:true", async () => {
    await setWorkspace(1);
    await (wm as Wm).updateComplete;
    const grid = wm.shadowRoot?.querySelector<HTMLElement>("openp41ge-manager-grid")!;
    const tabGrid = grid.shadowRoot?.querySelector<HTMLElement>("tab-grid")!;
    tabGrid.dispatchEvent(
      new CustomEvent("grid-open-tab", {
        bubbles: true,
        composed: true,
        detail: {
          tabType: "ext:openp41ge-extension-workspaces:workspace-editor",
          tabConfig: { path: "/w/a", dir: "" },
          targetCol: 0,
          pinned: true,
        },
      }),
    );
    const tabs = (grid as unknown as { _tabs: Array<{ pinned?: boolean }> })._tabs;
    expect(tabs).toHaveLength(1);
    expect(tabs[0].pinned).toBe(true);
  });

  it("starts a workspace-row drag with the open-tab + bitmap payload at the drag threshold", async () => {
    await setWorkspace(1);
    await (wm as Wm).updateComplete;
    const row = wm.shadowRoot?.querySelector<HTMLElement>(".ws-row")!;
    row.dispatchEvent(
      new MouseEvent("mousedown", {
        button: 0,
        bubbles: true,
        composed: true,
        screenX: 200,
        screenY: 300,
      }),
    );

    // Mousedown arms the drag but does not start the native ghost yet.
    expect((wm as Wm)._rowDragActive).toBe(true);
    expect((wm as Wm)._rowDragSource).not.toBeNull();
    expect(drags.dragStart).not.toHaveBeenCalled();

    // Crossing the threshold (a POSITION event) fires the deferred drag.start
    // with the `open-tab` payload + the captured row bitmap rect.
    document.dispatchEvent(
      new CustomEvent("openp41ge-drag-position", {
        detail: { screenX: 205, screenY: 305 },
      }),
    );
    expect(drags.dragStart).toHaveBeenCalledTimes(1);
    const args = drags.dragStart.mock.calls[0] as unknown[];
    expect(args[11]).toBe("open-tab");
    expect(args[15]).toEqual({
      appType: "ext:openp41ge-extension-workspaces:workspace-editor",
      tabConfig: { path: "/w/a", dir: "" },
    });
    // A bitmap rect was captured so the main-process ghost renders the row.
    expect(args[13]).toMatchObject({
      x: expect.any(Number),
      y: expect.any(Number),
      width: expect.any(Number),
      height: expect.any(Number),
    });

    // END hides the ghost and resets the row-drag state.
    document.dispatchEvent(new CustomEvent("openp41ge-drag-end"));
    expect(drags.dragEnd).toHaveBeenCalledTimes(1);
    expect((wm as Wm)._rowDragActive).toBe(false);
    expect((wm as Wm)._pendingRowDragStart).toBeNull();
  });

  it("drags a settings row like a workspace row, carrying its settings editor tab", async () => {
    (wm as Wm)._activeTab = "settings";
    await (wm as Wm).updateComplete;
    const row = wm.shadowRoot?.querySelector<HTMLElement>('[data-settings-id="openp41ge"]')!;
    row.dispatchEvent(
      new MouseEvent("mousedown", {
        button: 0,
        bubbles: true,
        composed: true,
        screenX: 200,
        screenY: 300,
      }),
    );
    expect((wm as Wm)._rowDragActive).toBe(true);
    document.dispatchEvent(
      new CustomEvent("openp41ge-drag-position", { detail: { screenX: 205, screenY: 305 } }),
    );
    const args = drags.dragStart.mock.calls[0] as unknown[];
    expect(args[0]).toBe("Platform Settings");
    expect(args[11]).toBe("open-tab");
    expect(args[15]).toEqual({
      appType: "config-editor",
      tabConfig: { extensionId: "openp41ge", path: "config:openp41ge" },
    });

    // The click that ends the drag does not also open it.
    const grid = wm.shadowRoot?.querySelector("openp41ge-manager-grid") as unknown as {
      openApp: ReturnType<typeof vi.fn>;
    };
    grid.openApp = vi.fn();
    row.click();
    expect(grid.openApp).not.toHaveBeenCalled();
    document.dispatchEvent(new CustomEvent("openp41ge-drag-end"));
  });

  it("opens a workspace-editor cell when an open-tab drop lands on the grid", async () => {
    await setWorkspace(1);
    await (wm as Wm).updateComplete;
    const grid = wm.shadowRoot?.querySelector<HTMLElement>("openp41ge-manager-grid")!;
    const tabGrid = grid.shadowRoot?.querySelector<HTMLElement>("tab-grid")!;
    tabGrid.dispatchEvent(
      new CustomEvent("grid-open-tab", {
        bubbles: true,
        composed: true,
        detail: {
          tabType: "ext:openp41ge-extension-workspaces:workspace-editor",
          tabConfig: { path: "/w/a", dir: "" },
          targetCol: 0,
          pinned: true,
        },
      }),
    );
    const tabs = (
      grid as unknown as { _tabs: Array<{ appType: string; config?: Record<string, unknown> }> }
    )._tabs;
    expect(tabs).toHaveLength(1);
    expect(tabs[0].appType).toBe("ext:openp41ge-extension-workspaces:workspace-editor");
    expect(tabs[0].config?.path).toBe("/w/a");
  });

  /** Stub the grid shadow root's (unimplemented-in-jsdom) element stack so the
   *  row drag target resolver can be exercised: `elementsFromPoint` returns the
   *  stacking stack topmost-first, INCLUDING the shadow-root grid beneath any
   *  child element (empty-grid content) that covers it — the real bug
   *  was that `elementFromPoint` returned ONLY the topmost overlay, so no drop
   *  target was found.
   */
  function stubGridHitStack(grid: HTMLElement, overlay: Element | null, tabGrid: Element): void {
    const root = (grid as unknown as { shadowRoot: ShadowRoot }).shadowRoot;
    const stack = overlay ? [overlay, tabGrid] : [tabGrid];
    Object.defineProperty(root, "elementsFromPoint", {
      configurable: true,
      value: () => stack,
    });
  }

  it("resolves the grid drop target when the empty grid content covers the grid", async () => {
    await setWorkspace(1);
    await (wm as Wm).updateComplete;
    const grid = wm.shadowRoot?.querySelector<HTMLElement>("openp41ge-manager-grid")!;
    const tabGrid = grid.shadowRoot?.querySelector<HTMLElement>("tab-grid")!;

    const emptyContent = document.createElement("div");
    emptyContent.className = "tab-content-empty";
    stubGridHitStack(grid, emptyContent, tabGrid);

    const target = (
      wm as unknown as { _resolveRowTarget(x: number, y: number): unknown }
    )._resolveRowTarget(400, 200);
    expect(target).not.toBeNull();
    expect((target as { type: string }).type).toBe("grid");
  });

  it("does not resolve a drop target when the cursor is over the workspace list (sidebar)", async () => {
    await setWorkspace(1);
    await (wm as Wm).updateComplete;
    const grid = wm.shadowRoot?.querySelector<HTMLElement>("openp41ge-manager-grid")!;
    const tabGrid = grid.shadowRoot?.querySelector<HTMLElement>("tab-grid")!;

    // Over the sidebar only the manager host / ancestors are hit — no tab-grid.
    const host = wm as unknown as HTMLElement;
    Object.defineProperty(
      (grid as unknown as { shadowRoot: ShadowRoot }).shadowRoot,
      "elementsFromPoint",
      { configurable: true, value: () => [host] },
    );

    const target = (
      wm as unknown as { _resolveRowTarget(x: number, y: number): unknown }
    )._resolveRowTarget(100, 200);
    expect(target).toBeNull();
  });

  it("shows the cell-highlight drop box while a row drags over the grid", async () => {
    await setWorkspace(1);
    await (wm as Wm).updateComplete;
    const grid = wm.shadowRoot?.querySelector<HTMLElement>("openp41ge-manager-grid")!;
    const tabGrid = grid.shadowRoot?.querySelector<HTMLElement>("tab-grid")!;
    stubGridHitStack(grid, null, tabGrid);

    const source = {
      type: "open-tab",
      createGhost: () => document.createElement("div"),
      getDragData: () => ({
        type: "open-tab",
        appType: "ext:openp41ge-extension-workspaces:workspace-editor",
      }),
      onDragStart: () => undefined,
      onDragEnd: () => undefined,
    } as never;
    (wm as unknown as { _rowDragActive: boolean })._rowDragActive = true;
    (wm as unknown as { _rowDragSource: unknown })._rowDragSource = source;

    // Before the hover: no overlay is rendered.
    expect(grid.shadowRoot?.querySelector(".openp41ge-ghost-overlay")).toBeNull();

    (wm as unknown as { _updateRowGridGhost(x: number, y: number): void })._updateRowGridGhost(
      400,
      200,
    );

    // Over the grid, GridDropTarget.onHover reports a cell-highlight with a
    // showGhost config, so the manager renders the blue drop box overlay.
    const overlay = grid.shadowRoot?.querySelector(".openp41ge-ghost-overlay");
    expect(overlay).not.toBeNull();
    expect(overlay?.querySelector("drop-box")).not.toBeNull();

    // Leaving the grid clears the indicator — make the resolver stop
    // matching the grid (the coord-aware stub returns an empty stack).
    Object.defineProperty(
      (grid as unknown as { shadowRoot: ShadowRoot }).shadowRoot,
      "elementsFromPoint",
      { configurable: true, value: () => [] },
    );
    (wm as unknown as { _updateRowGridGhost(x: number, y: number): void })._updateRowGridGhost(
      100,
      200,
    );
    expect(grid.shadowRoot?.querySelector(".openp41ge-ghost-overlay")).toBeNull();
  });

  it("does not show the drop indicator on a plain click mousemove (before drag activation)", async () => {
    await setWorkspace(1);
    await (wm as Wm).updateComplete;
    const grid = wm.shadowRoot?.querySelector<HTMLElement>("openp41ge-manager-grid")!;
    const tabGrid = grid.shadowRoot?.querySelector<HTMLElement>("tab-grid")!;
    stubGridHitStack(grid, null, tabGrid);

    const source = {
      type: "open-tab",
      createGhost: () => document.createElement("div"),
      getDragData: () => ({
        type: "open-tab",
        appType: "ext:openp41ge-extension-workspaces:workspace-editor",
      }),
      onDragStart: () => undefined,
      onDragEnd: () => undefined,
    } as never;

    // Mousedown arms the drag and attaches the document mousemove listener,
    // but the drag has NOT crossed the start threshold.
    (wm as unknown as { _beginRowDrag(s: unknown): void })._beginRowDrag(source);

    // A mousemove before activation must not paint a drop target.
    document.dispatchEvent(new MouseEvent("mousemove", { clientX: 400, clientY: 200 }));
    expect(grid.shadowRoot?.querySelector(".openp41ge-ghost-overlay")).toBeNull();

    // Once the drag activates (POSITION past threshold), a mousemove shows it.
    (wm as unknown as { _rowDragActivated: boolean })._rowDragActivated = true;
    document.dispatchEvent(new MouseEvent("mousemove", { clientX: 400, clientY: 200 }));
    expect(grid.shadowRoot?.querySelector(".openp41ge-ghost-overlay")).not.toBeNull();

    (wm as unknown as { _endRowDrag(): void })._endRowDrag();
  });

  it("renders confirm + cancel buttons to the right of the new-workspace row", async () => {
    await openAddRow();

    const row = wm.shadowRoot?.querySelector(".ws-row--new");
    const actions = row?.querySelectorAll(".ws-new-actions .ws-action");
    expect(actions?.length).toBe(2);
    const confirm = row?.querySelector(".ws-action--confirm");
    const cancel = row?.querySelector(".ws-action--cancel");
    expect(confirm?.getAttribute("aria-label")).toBe("Create workspace");
    expect(cancel?.getAttribute("aria-label")).toBe("Cancel");

    // The action group is a sibling after the info column (the row's right edge).
    const info = row?.querySelector(".ws-info");
    expect(info?.nextElementSibling).toBe(row?.querySelector(".ws-new-actions"));
  });

  it("cancel closes the add row without creating a workspace", async () => {
    await openAddRow();

    const input = wm.shadowRoot?.querySelector<HTMLInputElement>(".wm-new-ws-input");
    if (input) input.value = "ShouldNotPersist";
    const cancel = wm.shadowRoot?.querySelector<HTMLElement>(".ws-action--cancel");
    cancel?.click();
    await listUpdated();

    expect(wm.shadowRoot?.querySelector(".ws-row--new")).toBeNull();
  });

  it("confirm builds the workspace from the typed name and closes the row", async () => {
    await openAddRow();

    const input = wm.shadowRoot?.querySelector<HTMLInputElement>(".wm-new-ws-input");
    if (input) input.value = "My Workspace";
    const confirm = wm.shadowRoot?.querySelector<HTMLElement>(".ws-action--confirm");
    confirm?.click();
    await listUpdated();

    // The create goes through the list's create: the row is dismissed and
    // the input value is consumed (the stubbed service write fails, which
    // the list logs and swallows).
    expect(wm.shadowRoot?.querySelector(".ws-row--new")).toBeNull();
  });
});

describe("Openp41geWindowManager sidebar + grid layout", () => {
  let wm: Wm;

  beforeEach(() => {
    stubWindow();
    wm = new Openp41geWindowManager() as Wm;
    document.body.appendChild(wm as unknown as HTMLElement);
  });

  afterEach(() => {
    wm.remove();
  });

  it("renders the tab rail and its content inside the left sidebar", async () => {
    await (wm as Wm).updateComplete;
    const sr = wm.shadowRoot!;
    // The sidebar hosts its own tab bar at the top …
    const sidebar = sr.querySelector<HTMLElement>(".wm-sidebar")!;
    expect(sidebar).not.toBeNull();
    expect(sidebar.querySelector(".wm-tabbar")).not.toBeNull();
    // … and the tab content (the body pane) lives beneath it, directly inside
    // the sidebar — NOT nested inside the 35px-tall tab bar (which would clip it).
    const content = sidebar.querySelector<HTMLElement>(".wm-sidebar-content")!;
    expect(content).not.toBeNull();
    expect(content.parentElement).toBe(sidebar);
    expect(content.querySelector(".wm-tabbar")).toBeNull();
    expect(content.querySelector(".wm-body")).not.toBeNull();
    // The body is NOT in the main/grid region.
    expect(sr.querySelector(".wm-main .wm-body")).toBeNull();
  });

  it("renders the main region as a sibling grid with an empty state", async () => {
    await (wm as Wm).updateComplete;
    const sr = wm.shadowRoot!;
    const layer = sr.querySelector<HTMLElement>(".wm-drawer-layer")!;
    const sidebar = layer.querySelector<HTMLElement>(".wm-sidebar")!;
    const main = layer.querySelector<HTMLElement>(".wm-main")!;
    const content = sidebar.querySelector<HTMLElement>(".wm-sidebar-content")!;
    expect(sidebar).not.toBeNull();
    expect(main).not.toBeNull();
    // The main grid is a direct sibling of the sidebar inside the layer (not
    // nested inside the sidebar, which would collapse the sidebar layout).
    expect(main.parentElement).toBe(layer);
    expect(sidebar.parentElement).toBe(layer);
    expect(content.parentElement).toBe(sidebar);
    // Sidebar sits to the left of the main grid region (earlier document order).
    expect(main.compareDocumentPosition(sidebar) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
    // With nothing open, the grid's own tab-content shows a single empty state.
    const tabGrid = main
      .querySelector<HTMLElement>("openp41ge-manager-grid")!
      .shadowRoot!.querySelector("tab-grid");
    expect(tabGrid?.querySelector(".tab-content-empty")?.textContent?.trim()).toBe("no tabs");
  });
});

describe("Openp41geWindowManager tab closure + grid surface", () => {
  let wm: Wm;

  beforeEach(() => {
    stubWindow();
    wm = new Openp41geWindowManager() as Wm;
    document.body.appendChild(wm as unknown as HTMLElement);
  });

  afterEach(() => {
    wm.remove();
  });

  it("the + stays fixed at the end of the bar: only the tabs scroll, behind it", async () => {
    wm._openTabs = ["workspaces", "settings", "releases"];
    wm._activeTab = "workspaces";
    await (wm as Wm).updateComplete;
    const sr = wm.shadowRoot!;
    const bar = sr.querySelector<HTMLElement>(".wm-tabbar")!;
    const strip = bar.querySelector<HTMLElement>(".wm-tabbar-scroll")!;
    expect(strip).not.toBeNull();
    expect(strip.querySelectorAll(".wm-tab")).toHaveLength(3);
    const add = sr.querySelector<HTMLElement>(".wm-tabbar-add")!;
    expect(add.parentElement).toBe(bar);
    expect(strip.contains(add)).toBe(false);
  });

  it("tabs fade at an edge they are scrolled past (as the workspace window's sidebars)", async () => {
    wm._openTabs = ["workspaces", "settings", "releases"];
    wm._activeTab = "workspaces";
    await (wm as Wm).updateComplete;
    const sr = wm.shadowRoot!;
    const strip = sr.querySelector<HTMLElement>(".wm-tabbar-scroll")!;
    const fade = (side: string) => sr.querySelector<HTMLElement>(`.wm-tabbar-fade--${side}`)!;
    expect(fade("left").hasAttribute("data-shown")).toBe(false);
    expect(fade("right").hasAttribute("data-shown")).toBe(false);

    Object.defineProperty(strip, "scrollWidth", { value: 500, configurable: true });
    Object.defineProperty(strip, "clientWidth", { value: 200, configurable: true });
    strip.scrollLeft = 0;
    strip.dispatchEvent(new Event("scroll"));
    await (wm as Wm).updateComplete;
    expect(fade("left").hasAttribute("data-shown")).toBe(false);
    expect(fade("right").hasAttribute("data-shown")).toBe(true);

    strip.scrollLeft = 300;
    strip.dispatchEvent(new Event("scroll"));
    await (wm as Wm).updateComplete;
    expect(fade("left").hasAttribute("data-shown")).toBe(true);
    expect(fade("right").hasAttribute("data-shown")).toBe(false);
  });

  it("closes the Workspaces tab when another tab remains open", async () => {
    wm._openTabs = ["workspaces", "settings"];
    wm._activeTab = "workspaces";
    await (wm as Wm).updateComplete;
    const sr = wm.shadowRoot!;
    const closeBtn = sr.querySelector<HTMLElement>(
      '[data-manager-tab="workspaces"] .wm-tab-close',
    )!;
    expect(closeBtn).not.toBeNull();
    // The toolkit's close button, as on every tab handle.
    expect(closeBtn.tagName).toBe("TAB-CLOSE");
    closeBtn.click();
    await (wm as Wm).updateComplete;
    expect(wm._openTabs).toEqual(["settings"]);
    expect(wm._activeTab).toBe("settings");
    expect(sr.querySelector('[data-manager-tab="workspaces"]')).toBeNull();
  });

  it("closes the last tab, leaving an empty bar, no active tab, and an empty state", async () => {
    wm._openTabs = ["workspaces"];
    wm._activeTab = "workspaces";
    await (wm as Wm).updateComplete;
    const sr = wm.shadowRoot!;
    const closeBtn = sr.querySelector<HTMLElement>(
      '[data-manager-tab="workspaces"] .wm-tab-close',
    )!;
    closeBtn.click();
    await (wm as Wm).updateComplete;
    expect(wm._openTabs).toEqual([]);
    expect(wm._activeTab).toBeNull();
    expect(sr.querySelector('[data-manager-tab="workspaces"]')).toBeNull();
    // The + add button remains so tabs can be re-opened, and the body shows the
    // empty prompt instead of a pane.
    expect(sr.querySelector(".wm-tabbar-add")).not.toBeNull();
    expect(sr.querySelector(".wm-no-tabs")).not.toBeNull();
    expect(sr.querySelector(".wm-workspaces-pane")).toBeNull();
  });

  it("offers a Cleanup tab in the + menu, which shows the cleanup pane", async () => {
    await (wm as Wm).updateComplete;
    wm.shadowRoot!.querySelector<HTMLElement>(".wm-tabbar-add")!.click();
    const menu = document.querySelector("openp41ge-contextmenu") as unknown as {
      items: Array<{ label: string; action: () => void }>;
    };
    const cleanup = menu.items.find((i) => i.label === "Cleanup");
    expect(cleanup).toBeDefined();
    (menu as unknown as HTMLElement).remove();
    cleanup!.action();
    await (wm as Wm).updateComplete;
    expect(wm._activeTab).toBe("cleanup");
    expect(wm.shadowRoot!.querySelector("openp41ge-cleanup-pane")).not.toBeNull();
  });

  it("shows the Cleanup tab's icon on its tab handle", async () => {
    wm._openTabs = ["workspaces", "cleanup"];
    wm._activeTab = "workspaces";
    await (wm as Wm).updateComplete;
    const icon = wm.shadowRoot!.querySelector('[data-manager-tab="cleanup"] .wm-tab-icon svg');
    expect(icon).not.toBeNull();
    expect(icon!.getAttribute("fill")).toBe("currentColor");
  });

  it("shows the Releases tab's icon on its tab handle", async () => {
    wm._openTabs = ["workspaces", "releases"];
    wm._activeTab = "workspaces";
    await (wm as Wm).updateComplete;
    const icon = wm.shadowRoot!.querySelector('[data-manager-tab="releases"] .wm-tab-icon svg');
    expect(icon).not.toBeNull();
    expect(icon!.getAttribute("fill")).toBe("currentColor");
    expect(icon!.querySelector("path")!.getAttribute("d")).toMatch(/^m720-80 120-120/);
  });

  it("offers a Migrations tab in the + menu, which shows the migrations pane", async () => {
    await (wm as Wm).updateComplete;
    wm.shadowRoot!.querySelector<HTMLElement>(".wm-tabbar-add")!.click();
    const menu = document.querySelector("openp41ge-contextmenu") as unknown as {
      items: Array<{ label: string; action: () => void }>;
    };
    const item = menu.items.find((i) => i.label === "Migrations");
    expect(item).toBeDefined();
    (menu as unknown as HTMLElement).remove();
    item!.action();
    await (wm as Wm).updateComplete;
    expect(wm._activeTab).toBe("migrations");
    expect(wm.shadowRoot!.querySelector("openp41ge-migrations-pane")).not.toBeNull();
  });

  it("re-opens a tab from the + menu after all tabs are closed", async () => {
    wm._openTabs = ["workspaces"];
    wm._activeTab = "workspaces";
    await (wm as Wm).updateComplete;
    wm.shadowRoot!.querySelector<HTMLElement>(
      '[data-manager-tab="workspaces"] .wm-tab-close',
    )!.click();
    await (wm as Wm).updateComplete;
    // Simulate choosing "Settings" from the + menu.
    (wm as Wm)._activateTab("settings");
    await (wm as Wm).updateComplete;
    expect(wm._openTabs).toEqual(["settings"]);
    expect(wm._activeTab).toBe("settings");
  });

  it("paints the main grid region with the content surface background", async () => {
    await (wm as Wm).updateComplete;
    const sr = wm.shadowRoot!;
    const styleText = Array.from(sr.querySelectorAll("style"))
      .map((s) => s.textContent ?? "")
      .join("\n");
    // The grid region should match the sidebar/content surface (bg-secondary),
    // not inherit the lighter root background (bg).
    const mainRule = styleText.match(/\.wm-main\s*{[^}]*}/)?.[0] ?? "";
    expect(mainRule).toContain("background: var(--bg-secondary");
  });
});

describe("Openp41geWindowManager Cleanup dot", () => {
  let wm: Wm;
  let changed: () => void = () => {};
  let items: unknown[] = [];

  beforeEach(() => {
    stubWindow();
    (window as unknown as { openp41ge: Record<string, unknown> }).openp41ge.cleanup = {
      list: vi.fn(async () => items),
      onChanged: vi.fn((fn: () => void) => {
        changed = fn;
        return () => {};
      }),
    };
  });

  afterEach(() => {
    wm.remove();
    document.querySelectorAll("openp41ge-contextmenu").forEach((m) => m.remove());
  });

  async function cleanupMenuItem(): Promise<{ label: string; dot?: boolean }> {
    await (wm as Wm).updateComplete;
    wm.shadowRoot!.querySelector<HTMLElement>(".wm-tabbar-add")!.click();
    const menu = document.querySelector("openp41ge-contextmenu") as unknown as {
      items: Array<{ label: string; dot?: boolean }>;
    };
    const item = menu.items.find((i) => i.label === "Cleanup")!;
    (menu as unknown as HTMLElement).remove();
    return item;
  }

  async function mount(): Promise<void> {
    wm = new Openp41geWindowManager() as Wm;
    document.body.appendChild(wm as unknown as HTMLElement);
    await new Promise((r) => setTimeout(r, 0));
  }

  it("marks Cleanup in the + menu while there is something to review", async () => {
    items = [{ kind: "repository", path: "/r/x", name: "x", repositories: [] }];
    await mount();
    expect((await cleanupMenuItem()).dot).toBe(true);
  });

  it("does not mark it when there is nothing, and follows changes", async () => {
    items = [];
    await mount();
    expect((await cleanupMenuItem()).dot).toBeFalsy();
    items = [{ kind: "repository", path: "/r/x", name: "x", repositories: [] }];
    changed();
    await new Promise((r) => setTimeout(r, 0));
    expect((await cleanupMenuItem()).dot).toBe(true);
  });
});

describe("Openp41geWindowManager traffic lights", () => {
  let wm: Wm;

  beforeEach(() => {
    stubWindow();
    const w = (window as unknown as { openp41ge: Record<string, unknown> }).openp41ge;
    w.window = { close: vi.fn(), minimize: vi.fn(), toggleFullScreen: vi.fn() };
    wm = new Openp41geWindowManager() as Wm;
    document.body.appendChild(wm as unknown as HTMLElement);
  });

  afterEach(() => {
    wm.remove();
  });

  it("has all three: close, minimize and a green fullscreen light", async () => {
    await (wm as Wm).updateComplete;
    const buttons = [...(wm.shadowRoot?.querySelectorAll<HTMLElement>(".wm-winbtns .wm-winbtn") ?? [])];
    expect(buttons.map((b) => b.getAttribute("aria-label"))).toEqual([
      "Close window",
      "Minimize window",
      "Toggle full screen",
    ]);
    buttons[2].click();
    const api = (window as unknown as { openp41ge: { window: { toggleFullScreen: ReturnType<typeof vi.fn> } } })
      .openp41ge.window;
    expect(api.toggleFullScreen).toHaveBeenCalledTimes(1);
  });

  it("the green light is green", async () => {
    await (wm as Wm).updateComplete;
    const css = [...(wm.shadowRoot?.querySelectorAll("style") ?? [])]
      .map((s) => s.textContent ?? "")
      .join("\n");
    expect(css).toMatch(/\.wm-winbtn--full\s*\{[^}]*background:\s*#28c840;/);
  });
});

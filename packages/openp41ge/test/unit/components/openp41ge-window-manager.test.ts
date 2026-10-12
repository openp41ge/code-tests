/**
 * Unit tests for the Window Manager skeleton drag state machine.
 *
 * Covers the workspace skeleton gesture:
 *  - long-press (hold > HOLD_MS) shows the drag element without pointer movement
 *  - a quick drag that crosses the threshold cancels the pending long-press and
 *    starts the drag from the move handler
 *  - a quick click (down + up before the hold) never starts a drag
 *  - a fast flick is a drag-out, not a carousel swipe, and a swipe that pulls off
 *    the row or is released outside the window becomes a drag-out
 *
 * The drag IPC (`window.openp41ge.drag.*`) is stubbed so we can assert when a
 * native drag session is started/activated/ended without a real Electron main
 * process.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Openp41geWindowManager } from "../../../src/renderer/components/openp41ge-window-manager";
import { settingsIcon } from "../../../src/renderer/icons";

const HOLD_MS = 350;

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

/** A workspace with `n` window skeletons, so the carousel gesture is available. */
function withWindows(wm: Wm, path: string, n: number): void {
  wm._workspaces = [
    { filePath: path, data: { name: "Two", windows: Array.from({ length: n }, () => ({})) } },
  ] as never;
}

/** A fake drag source element for the pointer events. */
function makeThumb(): HTMLElement {
  return {
    getBoundingClientRect: () => ({ left: 10, top: 20, width: 132, height: 84 }),
  } as unknown as HTMLElement;
}

function down(wm: Wm, path: string, x = 50, y = 40, sx = 200, sy = 300): void {
  const e = new PointerEvent("pointerdown", {
    button: 0,
    clientX: x,
    clientY: y,
    screenX: sx,
    screenY: sy,
  });
  Object.defineProperty(e, "currentTarget", { value: makeThumb() });
  (wm as Wm)._onThumbPointerDown(e as PointerEvent, path, false);
}

function move(wm: Wm, x = 53, y = 100, sx = 203, sy = 360): void {
  const e = new PointerEvent("pointermove", { clientX: x, clientY: y, screenX: sx, screenY: sy });
  Object.defineProperty(e, "currentTarget", { value: makeThumb() });
  (wm as Wm)._onThumbPointerMove(e as PointerEvent);
}

function up(wm: Wm, x = 53, y = 100, sx = 203, sy = 360): void {
  const e = new PointerEvent("pointerup", { clientX: x, clientY: y, screenX: sx, screenY: sy });
  Object.defineProperty(e, "currentTarget", { value: makeThumb() });
  (wm as Wm)._onThumbPointerUp(e as PointerEvent);
}

describe("Openp41geWindowManager skeleton drag", () => {
  let wm: Wm;
  let drags: ReturnType<typeof stubWindow>;

  beforeEach(() => {
    vi.useFakeTimers();
    drags = stubWindow();
    wm = new Openp41geWindowManager() as Wm;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("begins a pending drag on pointerdown", () => {
    down(wm, "/w/two");
    expect(wm._drag).not.toBeNull();
    expect((wm._drag as { active: boolean }).active).toBe(false);
    expect(wm._holdTimer).not.toBeNull();
    expect(drags.dragStart).not.toHaveBeenCalled();
  });

  it("starts the open drag (ghost) after a long-press with no movement", () => {
    down(wm, "/w/two", 50, 40, 200, 300);
    vi.advanceTimersByTime(HOLD_MS + 5);

    expect((wm._drag as { active: boolean }).active).toBe(true);
    expect((wm._drag as { mode: string }).mode).toBe("open");
    expect(wm._suppressClick).toBe(true);
    expect(wm._holdTimer).toBeNull();
    expect(drags.dragStart).toHaveBeenCalledTimes(1);
    expect(drags.dragActivate).toHaveBeenCalledTimes(1);
    expect(drags.dragMove).toHaveBeenCalled();
  });

  it("cancels the pending long-press and starts the drag on a quick move past threshold", () => {
    down(wm, "/w/two", 50, 40, 200, 300);
    move(wm, 53, 100, 203, 360); // vertical → open, crosses the threshold

    expect(wm._holdTimer).toBeNull();
    expect((wm._drag as { active: boolean }).active).toBe(true);
    expect((wm._drag as { mode: string }).mode).toBe("open");
    expect(drags.dragStart).toHaveBeenCalledTimes(1);

    // The long-press must NOT also fire now the drag has started.
    vi.advanceTimersByTime(HOLD_MS + 5);
    expect(drags.dragStart).toHaveBeenCalledTimes(1);
    expect(drags.dragActivate).toHaveBeenCalledTimes(1);
  });

  it("keeps the drag from starting on a quick click (no move, release before hold)", () => {
    down(wm, "/w/two", 50, 40, 200, 300);
    up(wm, 50, 40, 200, 300); // release before the hold timer fires

    expect(wm._holdTimer).toBeNull();
    expect(wm._drag).toBeNull();
    expect(drags.dragStart).not.toHaveBeenCalled();
    expect(drags.dragActivate).not.toHaveBeenCalled();

    vi.advanceTimersByTime(HOLD_MS + 5);
    expect(drags.dragStart).not.toHaveBeenCalled();
  });

  it("passes the skeleton capture rect to drag.start for the bitmap ghost", () => {
    down(wm, "/w/two", 50, 40, 200, 300);
    vi.advanceTimersByTime(HOLD_MS + 5);
    const args = drags.dragStart.mock.calls[0] as unknown[];
    const captureRect = args[args.length - 2];
    expect(captureRect).toEqual({ x: 10, y: 20, width: 132, height: 84 });
  });

  it("passes the grabbed point (not the centred half-size) as the drag offset on long-press", () => {
    // Thumb rect is {left:10, top:20, width:132, height:84}; pointer at (50,40).
    down(wm, "/w/two", 50, 40, 200, 300);
    vi.advanceTimersByTime(HOLD_MS + 5);
    const args = drags.dragStart.mock.calls[0] as unknown[];
    expect(args[9]).toBe(50 - 10); // offsetX = cursor - rect.left
    expect(args[10]).toBe(40 - 20); // offsetY = cursor - rect.top
    // Regression: it used to be the hard-coded half-size (66, 42) which centred
    // the ghost on the cursor instead of hanging it from the grab point.
    expect(args[9]).not.toBe(66);
    expect(args[10]).not.toBe(42);
  });

  it("passes the grabbed point as the drag offset on a quick drag", () => {
    down(wm, "/w/two", 50, 40, 200, 300);
    move(wm, 53, 100, 203, 360); // crosses the threshold → open drag
    const args = drags.dragStart.mock.calls[0] as unknown[];
    expect(args[9]).toBe(50 - 10);
    expect(args[10]).toBe(40 - 20);
  });

  it("opens a drag-out on a sideways move — the carousel swipe gesture is gone", () => {
    withWindows(wm, "/w/two", 2);
    down(wm, "/w/two", 300, 40, 450, 300);
    move(wm, 230, 42, 380, 302); // well inside the window

    // No matter how horizontal the move, there is no carousel to page — it is a
    // drag-out.
    expect((wm._drag as { mode: string }).mode).toBe("open");
    expect(drags.dragStart).toHaveBeenCalledTimes(1);
    expect(drags.dragActivate).toHaveBeenCalledTimes(1);
  });

  it("opens on a release outside the window", () => {
    withWindows(wm, "/w/two", 2);
    down(wm, "/w/two", 300, 40, 450, 300);
    move(wm, 230, 42, 380, 302);

    up(wm, 230, 42, window.screenX + window.outerWidth + 50, 302);

    expect(drags.openWorkspaceWindow).toHaveBeenCalledWith("/w/two");
  });

  it("does not open when a drag is released inside the window", () => {
    withWindows(wm, "/w/two", 2);
    down(wm, "/w/two", 300, 40, 450, 300);
    move(wm, 230, 42, 380, 302);
    up(wm, 230, 42, 380, 302);

    expect(drags.openWorkspaceWindow).not.toHaveBeenCalled();
  });
});

describe("Openp41geWindowManager header search", () => {
  type WmSearch = Wm & {
    _workspaces: Array<{ filePath: string; data: unknown }>;
    _matchesQuery(ws: { data: unknown }, q: string, cs: boolean, re: boolean): boolean;
    _filteredWorkspaces: Array<{ filePath: string; data: unknown }>;
    _searchOpen: boolean;
    _searchQuery: string;
    _caseSensitive: boolean;
    _useRegex: boolean;
    _exitSearch(): void;
    _onSearchKeydown(e: KeyboardEvent): void;
  };

  let wm: WmSearch;

  beforeEach(() => {
    stubWindow();
    wm = new Openp41geWindowManager() as unknown as WmSearch;
  });

  const W = (
    filePath: string,
    name: string,
    repos: Array<{ url: string; worktrees: string[] }> = [],
  ) => ({ filePath, data: { name, repos } });

  it("matches a workspace by name, repo URL, and worktree name", () => {
    const w = W("/a", "Alpha", [
      { url: "https://github.com/acme/app", worktrees: ["main", "feat-x"] },
    ]);
    expect(wm._matchesQuery(w, "alpha", false, false)).toBe(true);
    expect(wm._matchesQuery(w, "acme/app", false, false)).toBe(true);
    expect(wm._matchesQuery(w, "feat-x", false, false)).toBe(true);
    expect(wm._matchesQuery(w, "nomatch", false, false)).toBe(false);
  });

  it("is case-insensitive by default and case-sensitive when toggled", () => {
    const w = W("/a", "Alpha");
    expect(wm._matchesQuery(w, "alpha", false, false)).toBe(true);
    expect(wm._matchesQuery(w, "ALPHA", false, false)).toBe(true);
    expect(wm._matchesQuery(w, "alpha", true, false)).toBe(false);
    expect(wm._matchesQuery(w, "Alpha", true, false)).toBe(true);
  });

  it("supports regex matching and returns false for an invalid regex", () => {
    const w = W("/a", "Alpha");
    expect(wm._matchesQuery(w, "^Al", false, true)).toBe(true);
    expect(wm._matchesQuery(w, "A.*a$", false, true)).toBe(true);
    expect(wm._matchesQuery(w, "[", false, true)).toBe(false);
  });

  it("returns all workspaces for an empty query and filters otherwise", () => {
    wm._workspaces = [
      W("/a", "Alpha", [{ url: "https://x/y", worktrees: [] }]),
      W("/b", "Beta", [{ url: "https://x/z", worktrees: ["feat"] }]),
    ];
    wm._searchQuery = "feat";
    expect(wm._filteredWorkspaces.map((w) => w.filePath)).toEqual(["/b"]);

    wm._searchQuery = "";
    expect(wm._filteredWorkspaces).toHaveLength(2);
  });

  it("exits search on Escape and resets the query + toggles", () => {
    wm._searchOpen = true;
    wm._searchQuery = "foo";
    wm._caseSensitive = true;
    wm._useRegex = true;
    wm._onSearchKeydown(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(wm._searchOpen).toBe(false);
    expect(wm._searchQuery).toBe("");
    expect(wm._caseSensitive).toBe(false);
    expect(wm._useRegex).toBe(false);
  });

  it("exits search via the clear control and resets the query", () => {
    wm._searchOpen = true;
    wm._searchQuery = "bar";
    wm._exitSearch();
    expect(wm._searchOpen).toBe(false);
    expect(wm._searchQuery).toBe("");
  });
});

describe("Openp41geWindowManager workspace row thumbnails", () => {
  let wm: Wm;
  let drags: ReturnType<typeof stubWindow>;

  beforeEach(() => {
    drags = stubWindow();
    wm = new Openp41geWindowManager() as Wm;
    (wm as Wm)._loaded = true;
    document.body.appendChild(wm as unknown as HTMLElement);
  });

  afterEach(() => {
    wm.remove();
  });

  function setWorkspace(windows: number): void {
    (wm as Wm)._workspaces = [
      {
        filePath: "/w/a",
        data: { name: "Alpha", windows: Array.from({ length: windows }, () => ({})) },
      },
    ] as never;
    return wm.requestUpdate();
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
    setWorkspace(4);
    await (wm as Wm).updateComplete;

    expect(wm.shadowRoot?.querySelectorAll(".ws-thumb")?.length).toBe(0);
    expect(wm.shadowRoot?.querySelector(".ws-more")).toBeNull();
    expect(wm.shadowRoot?.querySelector(".ws-thumbs")).toBeNull();
    // The edit affordance is gone — the row itself opens the editor cell.
    expect(wm.shadowRoot?.querySelector(".ws-edit")).toBeNull();
  });

  it("shows no window skeletons even when the workspace has windows", async () => {
    setWorkspace(3);
    await (wm as Wm).updateComplete;

    expect(wm.shadowRoot?.querySelectorAll(".ws-thumb")?.length).toBe(0);
    expect(wm.shadowRoot?.querySelector(".ws-more")).toBeNull();
    expect(wm.shadowRoot?.querySelector(".ws-name")?.textContent?.trim()).toBe("Alpha");
  });

  it("does not open the workspace on a single row click", async () => {
    setWorkspace(1);
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

  it("opens the workspace window via the row's open-window button", async () => {
    setWorkspace(1);
    await (wm as Wm).updateComplete;

    const btn = wm.shadowRoot?.querySelector<HTMLElement>(".ws-open-btn");
    expect(btn).not.toBeNull();
    btn?.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));

    expect(
      (
        window as unknown as {
          openp41ge: { windowManager: { openWorkspaceWindow: ReturnType<typeof vi.fn> } };
        }
      ).openp41ge.windowManager.openWorkspaceWindow,
    ).toHaveBeenCalledWith("/w/a");
  });

  it("no longer opens the workspace window on a row double-click", async () => {
    setWorkspace(1);
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
    setWorkspace(1);
    await (wm as Wm).updateComplete;

    // The per-row edit affordance is removed: the row itself opens the editor.
    expect(wm.shadowRoot?.querySelector<HTMLElement>(".ws-edit")).toBeNull();
    expect(wm.shadowRoot?.querySelector<HTMLElement>(".ws-row")).not.toBeNull();
  });

  it("opens a workspace-editor grid cell on a row click, without opening the window", async () => {
    setWorkspace(1);
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
    setWorkspace(1);
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
    setWorkspace(1);
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
    setWorkspace(1);
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
    setWorkspace(1);
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
    setWorkspace(1);
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
    setWorkspace(1);
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
    setWorkspace(1);
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
    setWorkspace(1);
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
    setWorkspace(1);
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
    (wm as Wm)._addingWorkspace = true;
    (wm as Wm).requestUpdate();
    await (wm as Wm).updateComplete;

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
    (wm as Wm)._addingWorkspace = true;
    (wm as Wm).requestUpdate();
    await (wm as Wm).updateComplete;

    const input = wm.shadowRoot?.querySelector<HTMLInputElement>(".wm-new-ws-input");
    if (input) input.value = "ShouldNotPersist";
    const cancel = wm.shadowRoot?.querySelector<HTMLElement>(".ws-action--cancel");
    cancel?.click();
    await (wm as Wm).updateComplete;

    expect((wm as Wm)._addingWorkspace).toBe(false);
    expect(wm.shadowRoot?.querySelector(".ws-row--new")).toBeNull();
  });

  it("confirm builds the workspace from the typed name and closes the row", async () => {
    (wm as Wm)._addingWorkspace = true;
    (wm as Wm).requestUpdate();
    await (wm as Wm).updateComplete;

    const input = wm.shadowRoot?.querySelector<HTMLInputElement>(".wm-new-ws-input");
    if (input) input.value = "My Workspace";
    const confirm = wm.shadowRoot?.querySelector<HTMLElement>(".ws-action--confirm");
    confirm?.click();
    await (wm as Wm).updateComplete;

    // The create goes through _createWorkspaceFromInput: the row is dismissed
    // and the input value is consumed (no .openp41ge.dialog in jsdom, so the
    // service write rejects, which _createWorkspaceFromInput swallows).
    expect((wm as Wm)._addingWorkspace).toBe(false);
    expect(wm.shadowRoot?.querySelector(".ws-row--new")).toBeNull();
  });
});

describe("Openp41geWindowManager sidebar + grid layout", () => {
  let wm: Wm;

  beforeEach(() => {
    stubWindow();
    wm = new Openp41geWindowManager() as Wm;
    (wm as Wm)._loaded = true;
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
    (wm as Wm)._loaded = true;
    document.body.appendChild(wm as unknown as HTMLElement);
  });

  afterEach(() => {
    wm.remove();
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
    (wm as Wm)._loaded = true;
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

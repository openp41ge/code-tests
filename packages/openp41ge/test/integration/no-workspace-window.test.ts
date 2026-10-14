/**
 * A window with no workspace (plans/2026-10-14-one-window.md, step 3) hosts
 * only tabs that need no workspace. Every tab type says which it is
 * (`workspace: "required" | "none"`, default "required"): the platform's
 * management and log tabs, settings editors, releases and log streams need
 * none; an extension declares it on its surfaces. Such a window's sidebar +
 * menus offer only those, and its grid opens only those.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  registerAppType,
  registerSystemTabType,
  getAppTypeRegistration,
  getSystemTabRegistration,
} from "@openp41ge/renderer/apps/app-registry";
import { registerManagementSidebarTabs } from "@openp41ge/renderer/apps/management/index";
import { registerLogSidebarTabs } from "@openp41ge/renderer/apps/log-viewer/sidebar-tabs";
import { configEditorAppRegistration } from "@openp41ge/renderer/apps/config-editor/index";
import { releaseAppRegistration } from "@openp41ge/renderer/apps/release/index";
import { logViewerAppRegistration } from "@openp41ge/renderer/apps/log-viewer/index";
import { fileViewerAppRegistration } from "@openp41ge/renderer/apps/file-viewer/index";
import { deriveSurfaceCatalog } from "@openp41ge/renderer/services/extension-renderer-runtime";
import { Openp41geTabsEventHandler } from "@openp41ge/renderer/services/openp41ge-tabs-event-handler";
import "@openp41ge/renderer/components/openp41ge-sidebar";

const ORIG: unknown = window.openp41ge;

/** The window's preload bridge: bound to `workspacePath` (null: no workspace). */
function bridge(workspacePath: string | null, dispatch = vi.fn()) {
  (window as unknown as { openp41ge: unknown }).openp41ge = {
    workspace: { dispatch, getWorkspacePath: () => workspacePath },
  };
  return dispatch;
}

afterEach(() => {
  (window as unknown as { openp41ge: unknown }).openp41ge = ORIG;
  document.body.innerHTML = "";
});

describe("which tab types need a workspace", () => {
  beforeEach(() => {
    registerManagementSidebarTabs();
    registerLogSidebarTabs();
  });

  it("the management and log sidebar tabs need none", () => {
    for (const id of ["workspaces", "settings", "releases", "cleanup", "migrations"]) {
      expect(getSystemTabRegistration(id)?.workspace, id).toBe("none");
    }
    for (const id of ["log-streams", "log-search"]) {
      expect(getSystemTabRegistration(id)?.workspace, id).toBe("none");
    }
  });

  it("settings editors, releases and log streams need none; a file does", () => {
    expect(configEditorAppRegistration.workspace).toBe("none");
    expect(releaseAppRegistration.workspace).toBe("none");
    expect(logViewerAppRegistration.workspace).toBe("none");
    expect(fileViewerAppRegistration.workspace).toBeUndefined();
  });

  it("an extension surface says so in its registration (default: needs one)", () => {
    const catalog = deriveSurfaceCatalog(
      "ext-x",
      [
        { kind: "grid", id: "free", title: "Free", workspace: "none", render: () => null as never },
        { kind: "grid", id: "bound", title: "Bound", render: () => null as never },
        {
          kind: "sidebar",
          id: "side",
          title: "Side",
          defaultSide: "left",
          workspace: "none",
          render: () => null as never,
        },
      ],
      {} as never,
    );
    expect(catalog.apps.map((a) => [a.id, a.workspace])).toEqual([
      ["ext:ext-x:free", "none"],
      ["ext:ext-x:bound", undefined],
    ]);
    expect(catalog.systemTabs[0].workspace).toBe("none");
  });
});

describe("a window with no workspace", () => {
  beforeEach(() => {
    registerSystemTabType({
      id: "ext:demo:explorer",
      label: "Demo Explorer",
      icon: "",
      description: "",
      defaultSide: "left",
      createController: () => ({}) as never,
    });
    registerSystemTabType({
      id: "ext:demo:notes",
      label: "Demo Notes",
      icon: "",
      description: "",
      defaultSide: "left",
      workspace: "none",
      createController: () => ({}) as never,
    });
  });

  async function menuLabels(): Promise<string[]> {
    const sidebar = document.createElement("openp41ge-sidebar") as HTMLElement & {
      side: string;
      windowId: string;
      isOpen: boolean;
      updateComplete: Promise<unknown>;
      _onAddTabClick(): void;
    };
    sidebar.side = "left";
    sidebar.windowId = "w";
    sidebar.isOpen = true;
    document.body.appendChild(sidebar);
    await sidebar.updateComplete;
    sidebar._onAddTabClick();
    const menu = document.querySelector("openp41ge-contextmenu") as unknown as {
      items: Array<{ label?: string }>;
    };
    return menu.items.map((i) => i.label ?? "");
  }

  it("its sidebar + menu offers only the tabs that need no workspace", async () => {
    bridge(null);
    const labels = await menuLabels();
    expect(labels).toContain("Demo Notes");
    expect(labels).not.toContain("Demo Explorer");
  });

  it("a window with a workspace offers both", async () => {
    bridge("/ws/a.openp41ge-workspace");
    const labels = await menuLabels();
    expect(labels).toEqual(expect.arrayContaining(["Demo Notes", "Demo Explorer"]));
  });

  describe("its grid", () => {
    let handler: Openp41geTabsEventHandler;
    let dispatchSpy: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      registerAppType(fileViewerAppRegistration);
      registerAppType(logViewerAppRegistration);
      dispatchSpy = vi.fn();
      handler = new Openp41geTabsEventHandler();
      handler.init({ dispatch: dispatchSpy } as never);
      const grid = document.createElement("tab-grid") as HTMLElement & { winId: string };
      grid.winId = "w1";
      grid.style.display = "none";
      document.body.appendChild(grid);
    });

    afterEach(() => handler.destroy());

    const open = (tabType: string, tabConfig: Record<string, unknown>) =>
      document.dispatchEvent(
        new CustomEvent("grid-open-tab", { detail: { tabType, tabConfig, targetCol: 0 } }),
      );

    it("opens a tab that needs no workspace", () => {
      bridge(null);
      open("log-viewer", { system: "openp41ge" });
      expect(dispatchSpy).toHaveBeenCalledWith(
        "actionOpenFile",
        "w1",
        "log-viewer",
        "openp41ge",
        "log:openp41ge",
        0,
        true,
        { system: "openp41ge" },
      );
    });

    it("does not open one that needs a workspace", () => {
      bridge(null);
      open("file-viewer", { filePath: "/x/a.ts" });
      expect(dispatchSpy).not.toHaveBeenCalled();
      expect(getAppTypeRegistration("file-viewer")).toBeDefined();
    });
  });
});

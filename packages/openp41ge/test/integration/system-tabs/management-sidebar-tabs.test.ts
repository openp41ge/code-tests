/**
 * The management sidebar tabs — Workspaces, Settings, Releases, Cleanup and
 * Migrations — are platform sidebar tabs a window can open, on either side.
 * What they open goes into the window's grid: a workspace row opens its editor, a
 * settings row that schema's config editor, a release row the release, all
 * through the grid's `grid-open-tab` open path. Workspace and settings rows
 * also drag, as the platform's `workspace-config` / `config-overrides`
 * payloads, through the platform drag pipeline.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getSystemTabRegistration,
  getAllSystemTabRegistrations,
} from "@openp41ge/renderer/apps/app-registry";
import { registerManagementSidebarTabs } from "@openp41ge/renderer/apps/management/index";
import { translateGridOpen } from "@openp41ge/renderer/services/grid-open-translators";
import { setReleasesDeps } from "@openp41ge/renderer/services/releases-deps";
import type { Openp41geSettingsList } from "@openp41ge/renderer/components/openp41ge-settings-list";
import type { Openp41geWorkspacesList } from "@openp41ge/renderer/components/openp41ge-workspaces-list";
import { extensionDrag } from "@openp41ge/renderer/services/extension-drag";
import { Openp41geCleanupPane } from "@openp41ge/renderer/components/openp41ge-cleanup-pane";
import { Openp41geMigrationsPane } from "@openp41ge/renderer/components/openp41ge-migrations-pane";

const TABS = [
  ["workspaces", "Workspaces", "openp41ge-workspaces-list"],
  ["settings", "Settings", "openp41ge-settings-list"],
  ["releases", "Releases", "openp41ge-releases-pane"],
  ["cleanup", "Cleanup", "openp41ge-cleanup-pane"],
  ["migrations", "Migrations", "openp41ge-migrations-pane"],
] as const;

/** Every `grid-open-tab` the document sees while a test runs. */
function recordGridOpens(): { opens: Array<Record<string, unknown>>; stop(): void } {
  const opens: Array<Record<string, unknown>> = [];
  const on = (e: Event) => opens.push((e as CustomEvent).detail as Record<string, unknown>);
  document.addEventListener("grid-open-tab", on);
  return { opens, stop: () => document.removeEventListener("grid-open-tab", on) };
}

async function mountTab(id: string): Promise<HTMLElement> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  await getSystemTabRegistration(id)!.createController(`tab-${id}`).mount(container);
  return container;
}

describe("management sidebar tabs in a workspace window", () => {
  let rec: ReturnType<typeof recordGridOpens>;

  beforeEach(() => {
    registerManagementSidebarTabs();
    setReleasesDeps({
      getChannel: () => "alpha",
      onChannelChange: () => () => undefined,
      onReleasesChange: () => () => undefined,
      getReleases: async () => ({ releases: [], fetchedAt: null, checking: false, error: null }),
      getInstalledVersion: async () => "0.1.0",
    });
    Openp41geCleanupPane.deps = {
      list: async () => [],
      run: async () => undefined,
      delete: async () => undefined,
      reveal: async () => undefined,
      onChanged: () => () => undefined,
      confirm: async () => false,
    } as unknown as typeof Openp41geCleanupPane.deps;
    Openp41geMigrationsPane.deps = {
      status: async () => ({ updates: 0, failed: false, lastUpdateAt: null }),
    } as unknown as typeof Openp41geMigrationsPane.deps;
    rec = recordGridOpens();
  });

  afterEach(() => {
    rec.stop();
    setReleasesDeps(null);
    Openp41geCleanupPane.deps = null;
    Openp41geMigrationsPane.deps = null;
    document.body.innerHTML = "";
  });

  it("registers each as a sidebar tab type, offered in the sidebar's + menu", () => {
    const offered = getAllSystemTabRegistrations().map((r) => r.id);
    for (const [id, label] of TABS) {
      expect(getSystemTabRegistration(id)?.label).toBe(label);
      expect(offered).toContain(id);
    }
  });

  it("each tab mounts its pane in the sidebar", async () => {
    for (const [id, , element] of TABS) {
      const container = await mountTab(id);
      expect(container.querySelector(element), id).not.toBeNull();
    }
  });

  it("a workspace row opens that workspace's editor in the grid", async () => {
    const container = await mountTab("workspaces");
    const list = container.querySelector("openp41ge-workspaces-list") as Openp41geWorkspacesList;
    list.onOpen!(
      { filePath: "/data/workspaces/a.openp41ge-workspace", data: { name: "A" } as never },
      false,
    );
    expect(rec.opens).toEqual([
      expect.objectContaining({
        tabType: "ext:openp41ge-extension-workspaces:workspace-editor",
        tabConfig: expect.objectContaining({
          path: "/data/workspaces/a.openp41ge-workspace",
          name: "A",
        }),
        pinned: false,
      }),
    ]);
  });

  describe("row drags", () => {
    const startPayloadDrag = vi.fn();

    beforeEach(() => {
      startPayloadDrag.mockClear();
      extensionDrag.init({
        windowContext: "workspace",
        pipeline: { startPayloadDrag, engageDrag: () => false },
      });
    });

    const press = (el: Element) =>
      el.dispatchEvent(new MouseEvent("mousedown", { button: 0, bubbles: true, composed: true }));

    it("a workspace row drags as a workspace-config payload", async () => {
      const container = await mountTab("workspaces");
      const list = container.querySelector("openp41ge-workspaces-list") as Openp41geWorkspacesList;
      list.deps = {
        list: async () => [{ filePath: "/ws/a.openp41ge-workspace", data: { name: "A" } as never }],
        create: async () => undefined,
        delete: async () => undefined,
        onChanged: () => () => undefined,
      };
      await list.reload();
      await list.updateComplete;
      press(list.querySelector(".ws-row")!);
      expect(startPayloadDrag).toHaveBeenCalledTimes(1);
      expect(startPayloadDrag.mock.calls[0][0].payload).toEqual({
        kind: "openp41ge/workspace-config",
        path: "/ws/a.openp41ge-workspace",
        name: "A",
      });
    });

    it("a settings row drags as a config-overrides payload", async () => {
      const container = await mountTab("settings");
      const list = container.querySelector("openp41ge-settings-list") as Openp41geSettingsList;
      await list.updateComplete;
      // Its first row (the platform's settings) shows before the schemas load.
      press(list.querySelector("[data-settings-id]")!);
      expect(startPayloadDrag).toHaveBeenCalledTimes(1);
      expect(startPayloadDrag.mock.calls[0][0].payload).toEqual({
        kind: "openp41ge/config-overrides",
        settingsId: "openp41ge",
      });
    });
  });

  it("a settings row opens that schema's config editor in the grid", async () => {
    const container = await mountTab("settings");
    const list = container.querySelector("openp41ge-settings-list") as Openp41geSettingsList;
    list.onOpen!("openp41ge-extension-git", true);
    expect(rec.opens).toEqual([
      expect.objectContaining({
        tabType: "config-editor",
        tabConfig: { extensionId: "openp41ge-extension-git" },
        pinned: true,
      }),
    ]);
  });

  it("a release row opens the release in the grid", async () => {
    const container = await mountTab("releases");
    container.querySelector("openp41ge-releases-pane")!.dispatchEvent(
      new CustomEvent("open-release", {
        detail: { tag: "v0.1.0-alpha.16", pinned: false },
        bubbles: true,
        composed: true,
      }),
    );
    expect(rec.opens).toEqual([
      expect.objectContaining({
        tabType: "release",
        tabConfig: { tag: "v0.1.0-alpha.16" },
        pinned: false,
      }),
    ]);
  });

  it("the grid opens a release tab per tag, titled by the tag", () => {
    expect(translateGridOpen("release", { tag: "v0.1.0-alpha.16" }, () => undefined)).toEqual({
      title: "v0.1.0-alpha.16",
      filePath: "release:v0.1.0-alpha.16",
      config: { tag: "v0.1.0-alpha.16", path: "release:v0.1.0-alpha.16" },
    });
    expect(translateGridOpen("release", {}, () => undefined)).toBeNull();
  });
});

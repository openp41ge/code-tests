/**
 * Grid tab decorations: an extension tab's label (title, description, icon)
 * from its surface's tabLabel.
 */
import { describe, it, expect } from "vitest";
// Static: it pulls in the JSON editor, too slow to import inside a test body
// when the suite runs under load.
import { configEditorAppRegistration } from "@openp41ge/renderer/apps/config-editor/index";

describe("extensionTabLabel", () => {
  it("is what the app's tabLabel gives for the tab's config, and nothing when it throws", async () => {
    const { extensionTabLabel } =
      await import("@openp41ge/renderer/components/grid-tab-decorations");
    const { registerAppType } = await import("@openp41ge/renderer/apps/app-registry");
    registerAppType({
      id: "ext:t:labelled",
      label: "Labelled",
      icon: "",
      description: "",
      createController: () => ({}) as never,
      tabLabel: (p) => ({ title: String(p.name), description: "muted", icon: "<svg/>" }),
    });
    registerAppType({
      id: "ext:t:broken",
      label: "Broken",
      icon: "",
      description: "",
      createController: () => ({}) as never,
      tabLabel: () => {
        throw new Error("boom");
      },
    });
    expect(extensionTabLabel("ext:t:labelled", { name: "x" })).toEqual({
      title: "x",
      description: "muted",
      icon: "<svg/>",
    });
    expect(extensionTabLabel("ext:t:broken", {})).toBeUndefined();
    expect(extensionTabLabel("file-viewer", {})).toBeUndefined();
  });
});

describe("isSettingsAppType", () => {
  it("is a settings app (config editor, a sidebar tab's settings), not other tabs", async () => {
    const { isSettingsAppType } =
      await import("@openp41ge/renderer/components/grid-tab-decorations");
    const { registerAppType, registerSystemTabType } =
      await import("@openp41ge/renderer/apps/app-registry");
    registerAppType(configEditorAppRegistration);
    registerSystemTabType({
      id: "t-sidebar",
      label: "Sidebar",
      icon: "",
      createController: () => ({}) as never,
      settings: {
        appType: "t-sidebar-settings",
        label: "Sidebar Settings",
        openEvent: "t:open",
        createController: () => ({}) as never,
      },
    } as never);
    registerAppType({
      id: "t-plain",
      label: "Plain",
      icon: "",
      description: "",
      createController: () => ({}) as never,
    });
    expect(isSettingsAppType("config-editor")).toBe(true);
    expect(isSettingsAppType("t-sidebar-settings")).toBe(true);
    expect(isSettingsAppType("t-plain")).toBe(false);
    expect(isSettingsAppType("not-registered")).toBe(false);
  });
});

/**
 * Tests for surfacing extension-contributed system tabs in the sidebar's
 * + add-tab menu.
 */
import { describe, it, expect } from "vitest";
import { Openp41geSidebar } from "../../../src/renderer/components/openp41ge-sidebar";
import { registerSystemTabType } from "../../../src/renderer/apps/app-registry";

interface MenuTab {
  id: string;
  label?: string;
}

describe("Openp41geSidebar add-tab menu", () => {
  it("lists the extension-registered sidebar tabs", () => {
    // An extension system-tab contribution (e.g. the Explorer extension).
    registerSystemTabType({
      id: "ext:openp41ge-extension-explorer:explorer",
      label: "Explorer",
      icon: "\uD83D\uDCC1",
      description: "Explorer \u2014 openp41ge-extension-explorer",
      defaultSide: "right",
      createController: () => ({}) as never,
    });

    const sidebar = new Openp41geSidebar();
    const items = (sidebar as unknown as {
      _menuTabRegistrations(): MenuTab[];
    })._menuTabRegistrations();

    const ids = items.map((reg) => reg.id);
    // The extension tab is offered…
    expect(ids).toContain("ext:openp41ge-extension-explorer:explorer");
    // The platform has no built-in sidebar tabs: no retired ones are offered.
    expect(ids).not.toContain("explorer");
    expect(ids).not.toContain("agents");
  });
});

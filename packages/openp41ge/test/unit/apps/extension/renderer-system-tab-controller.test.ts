/**
 * Regression: an extension sidebar tab must not take over the sidebar's tab
 * host. The sidebar shows only the active tab by toggling `visible` on each
 * `.sidebar-tab-host` (display:none otherwise); a controller that replaced the
 * host's class left its tab always showing, so switching tabs did nothing.
 */
import { describe, it, expect, vi } from "vitest";
import { html } from "lit";
import type { ILogger } from "openp41ge-core-logger";
import type { SidebarSurfaceSpec } from "openp41ge-sdk";
import { RendererSystemTabController } from "@openp41ge/renderer/apps/extension/renderer-system-tab-controller";

const spec = (text: string): SidebarSurfaceSpec => ({
  kind: "sidebar",
  id: text,
  title: text,
  defaultSide: "left",
  render: () => html`<p data-content>${text}</p>`,
});

const deps = {
  log: { error: vi.fn(), info: vi.fn(), debug: vi.fn(), warn: vi.fn() } as unknown as ILogger,
  openTab: vi.fn(),
};

/** A sidebar tab host, as openp41ge-sidebar creates it. */
function host(tabId: string): HTMLElement {
  const el = document.createElement("div");
  el.className = "sidebar-tab-host";
  el.dataset.tabHost = tabId;
  el.dataset.side = "left";
  document.body.append(el);
  return el;
}

describe("RendererSystemTabController", () => {
  it("leaves the sidebar's tab host alone so it can still be hidden", () => {
    const el = host("t1");
    el.classList.add("visible");
    const ctrl = new RendererSystemTabController("t1", "ext:x:a", spec("A"), deps);
    ctrl.mount(el);

    expect(el.className).toBe("sidebar-tab-host visible");
    expect(el.getAttribute("style")).toBeNull();
    expect(el.querySelector("[data-content]")?.textContent).toBe("A");

    // The sidebar hides an inactive tab by dropping `visible`.
    el.classList.remove("visible");
    expect(el.classList.contains("sidebar-tab-host")).toBe(true);
  });

  it("removes only its own content on unmount", () => {
    const el = host("t2");
    const ctrl = new RendererSystemTabController("t2", "ext:x:b", spec("B"), deps);
    ctrl.mount(el);
    ctrl.unmount();
    expect(el.childElementCount).toBe(0);
    expect(el.className).toBe("sidebar-tab-host");
  });
});

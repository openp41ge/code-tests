/**
 * An extension grid cell's `host.openTab` tells the platform which tab is
 * asking, so `placement: "next-column"` can open to the right of it.
 */
import { describe, it, expect, vi } from "vitest";
import { html } from "lit";
import type { ILogger } from "openp41ge-core-logger";
import type { GridSurfaceSpec, SurfaceHost } from "openp41ge-sdk";
import { RendererAppController } from "@openp41ge/renderer/apps/extension/renderer-app-controller";

describe("RendererAppController", () => {
  it("passes its tab id with every openTab", () => {
    let captured: SurfaceHost | undefined;
    const spec: GridSurfaceSpec = {
      kind: "grid",
      id: "cell",
      title: "Cell",
      render: (host) => {
        captured = host;
        return html`<p></p>`;
      },
    };
    const openTab = vi.fn();
    const ctrl = new RendererAppController("tab-7", "ext:x:cell", spec, {
      log: { error: vi.fn(), info: vi.fn(), debug: vi.fn(), warn: vi.fn() } as unknown as ILogger,
      openTab,
    });
    const el = document.createElement("div");
    document.body.append(el);
    ctrl.mount(el);

    const request = { appType: "ext:x:diff", placement: "next-column" as const };
    captured?.openTab(request);
    expect(openTab).toHaveBeenCalledWith(request, { tabId: "tab-7" });
    ctrl.unmount();
  });
});

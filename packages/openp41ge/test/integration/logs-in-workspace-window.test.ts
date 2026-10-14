/**
 * Logs in a workspace window (plans/2026-10-14-one-window.md, step 2).
 *
 * A log stream is a `log-viewer` grid tab (one per stream). Clicking one of
 * its rows opens that entry's detail drawer over the tab. "Open logs" opens
 * the platform's log; opening an error opens its stream and reveals the
 * entry. The Log Streams and Log Search sidebar tabs open streams into the
 * grid (a search hit focuses the stream's find bar on the query), and stream
 * rows drag as `openp41ge/log-stream` payloads.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { registerLogStream, _resetLogStreams, createLogger } from "openp41ge-core-logger";
import { Openp41geLogViewer } from "openp41ge-core-logger/viewer";
import { LogViewerController } from "@openp41ge/renderer/apps/log-viewer/log-viewer-controller";
import { openLogsInWindow } from "@openp41ge/renderer/apps/log-viewer/open-logs";
import { registerLogSidebarTabs } from "@openp41ge/renderer/apps/log-viewer/sidebar-tabs";
import { getSystemTabRegistration } from "@openp41ge/renderer/apps/app-registry";
import { translateGridOpen } from "@openp41ge/renderer/services/grid-open-translators";
import { extensionDrag } from "@openp41ge/renderer/services/extension-drag";
import { logsOpenInPlace } from "../../electron/logs-routing";

const BOOM = {
  timestamp: 5,
  level: 3,
  levelLabel: "ERROR",
  system: "ext-a",
  source: "ext-a",
  message: "[provider] boom\n    at fn (a.js:1:2)",
  process: "main",
  errorId: "e-1",
};

function installLogsBridge(): void {
  (window as unknown as { openp41ge: unknown }).openp41ge = {
    logs: {
      getPath: vi
        .fn()
        .mockResolvedValue({ logsDir: "/logs", capabilities: { readBackward: true } }),
      readBackward: vi.fn().mockResolvedValue({ entries: [BOOM], hasOlder: false, cursor: null }),
      findError: vi.fn(async (id: string) => (id === "e-1" ? BOOM : null)),
    },
  };
}

/** Every `grid-open-tab` the document sees while a test runs. */
function recordGridOpens(): { opens: Array<Record<string, unknown>>; stop(): void } {
  const opens: Array<Record<string, unknown>> = [];
  const on = (e: Event) => opens.push((e as CustomEvent).detail as Record<string, unknown>);
  document.addEventListener("grid-open-tab", on);
  return { opens, stop: () => document.removeEventListener("grid-open-tab", on) };
}

/** Mount a log tab for `system`, as the grid would. */
function mountLogTab(system: string): { controller: LogViewerController; container: HTMLElement } {
  const controller = new LogViewerController(`tab-${system}`);
  controller.restore({ system });
  const container = document.createElement("div");
  document.body.appendChild(container);
  controller.mount(container);
  return { controller, container };
}

let rec: ReturnType<typeof recordGridOpens>;

beforeEach(() => {
  _resetLogStreams();
  installLogsBridge();
  rec = recordGridOpens();
});

afterEach(() => {
  rec.stop();
  vi.restoreAllMocks();
  _resetLogStreams();
  delete (window as unknown as { openp41ge?: unknown }).openp41ge;
  document.body.innerHTML = "";
});

describe("a log stream grid tab", () => {
  it("shows its stream", () => {
    const { container } = mountLogTab("ext-a");
    const viewer = container.querySelector(Openp41geLogViewer.tagName) as Openp41geLogViewer;
    expect(viewer.system).toBe("ext-a");
  });

  it("opens a clicked row's detail drawer over the tab; closing it removes it", async () => {
    const { container } = mountLogTab("ext-a");
    container.querySelector(Openp41geLogViewer.tagName)!.dispatchEvent(
      new CustomEvent("log-row-click", {
        detail: { entry: BOOM },
        bubbles: true,
        composed: true,
      }),
    );
    const drawer = container.querySelector("openp41ge-log-detail-drawer") as HTMLElement & {
      updateComplete: Promise<unknown>;
    };
    expect(drawer).not.toBeNull();
    await drawer.updateComplete;
    expect(drawer.textContent).toContain("[provider] boom");
    expect(drawer.textContent).toContain("at fn (a.js:1:2)");
    drawer.querySelector<HTMLElement>('[data-testid="lw-drawer-close"]')!.click();
    expect(container.querySelector("openp41ge-log-detail-drawer")).toBeNull();
  });

  it("opens once per stream: the grid keys its tab by the stream", () => {
    expect(translateGridOpen("log-viewer", { system: "ext-a" }, () => undefined)).toEqual({
      title: "ext-a",
      filePath: "log:ext-a",
      config: { system: "ext-a" },
    });
  });
});

describe("opening logs in the window", () => {
  it("opens the platform's log, pinned", async () => {
    expect(await openLogsInWindow()).toBe(true);
    expect(rec.opens).toEqual([
      expect.objectContaining({
        tabType: "log-viewer",
        tabConfig: { system: "openp41ge" },
        pinned: true,
      }),
    ]);
  });

  it("opens an error's stream and reveals the entry once its tab mounts", async () => {
    const reveal = vi.spyOn(Openp41geLogViewer.prototype, "revealError").mockResolvedValue(null);
    expect(await openLogsInWindow({ errorId: "e-1" })).toBe(true);
    expect(rec.opens).toEqual([
      expect.objectContaining({
        tabType: "log-viewer",
        tabConfig: { system: "ext-a" },
        pinned: true,
      }),
    ]);
    mountLogTab("ext-a");
    await vi.waitFor(() => expect(reveal).toHaveBeenCalledWith("e-1"));
  });

  it("reveals in a tab already open for the stream", async () => {
    const reveal = vi.spyOn(Openp41geLogViewer.prototype, "revealError").mockResolvedValue(null);
    mountLogTab("ext-a");
    await openLogsInWindow({ errorId: "e-1" });
    await vi.waitFor(() => expect(reveal).toHaveBeenCalledWith("e-1"));
  });

  it("opens nothing for an error no log has", async () => {
    expect(await openLogsInWindow({ errorId: "nope" })).toBe(false);
    expect(rec.opens).toEqual([]);
  });

  it("main sends a workspace window's request back to it; others open the logs window", () => {
    expect(logsOpenInPlace("workspace")).toBe(true);
    expect(logsOpenInPlace("manager")).toBe(false);
    expect(logsOpenInPlace("logs")).toBe(false);
    expect(logsOpenInPlace(null)).toBe(false);
  });
});

describe("Log Streams and Log Search sidebar tabs", () => {
  beforeEach(() => registerLogSidebarTabs());

  async function mountSidebarTab(id: string): Promise<HTMLElement> {
    const container = document.createElement("div");
    document.body.appendChild(container);
    await getSystemTabRegistration(id)!.createController(`sys-${id}`).mount(container);
    const pane = container.firstElementChild as HTMLElement & { updateComplete?: Promise<unknown> };
    await pane.updateComplete;
    return container;
  }

  it("are sidebar tab types", () => {
    expect(getSystemTabRegistration("log-streams")?.label).toBe("Log Streams");
    expect(getSystemTabRegistration("log-search")?.label).toBe("Log Search");
  });

  it("Log Streams lists every stream; a click opens it as a preview", async () => {
    registerLogStream("openp41ge", "core");
    registerLogStream("ext-a", "x");
    const container = await mountSidebarTab("log-streams");
    const rows = [...container.querySelectorAll<HTMLElement>("[data-system]")];
    expect(rows.map((r) => r.dataset.system)).toEqual(["openp41ge", "ext-a"]);
    rows[1].click();
    expect(rec.opens).toEqual([
      expect.objectContaining({
        tabType: "log-viewer",
        tabConfig: { system: "ext-a" },
        pinned: false,
      }),
    ]);
  });

  it("a stream row drags as a log-stream payload", async () => {
    const startPayloadDrag = vi.fn();
    extensionDrag.init({
      windowContext: "workspace",
      pipeline: { startPayloadDrag, engageDrag: () => false },
    });
    registerLogStream("ext-a", "x");
    const container = await mountSidebarTab("log-streams");
    container
      .querySelector("[data-system]")!
      .dispatchEvent(new MouseEvent("mousedown", { button: 0, bubbles: true, composed: true }));
    expect(startPayloadDrag.mock.calls[0]?.[0].payload).toEqual({
      kind: "openp41ge/log-stream",
      system: "ext-a",
    });
  });

  it("Log Search finds entries across streams; a hit opens its stream, find bar on the query", async () => {
    registerLogStream("ext-a", "x");
    createLogger("ext-a", "x").info("needle in a haystack");
    const find = vi
      .spyOn(Openp41geLogViewer.prototype, "setFindQuery")
      .mockImplementation(() => {});
    const container = await mountSidebarTab("log-search");
    const input = container.querySelector<HTMLInputElement>("input")!;
    input.value = "needle";
    input.dispatchEvent(new Event("input"));
    const pane = container.firstElementChild as HTMLElement & { updateComplete: Promise<unknown> };
    await pane.updateComplete;
    const hits = [...container.querySelectorAll<HTMLElement>("[data-system]")];
    expect(hits).toHaveLength(1);
    hits[0].click();
    expect(rec.opens).toEqual([
      expect.objectContaining({
        tabType: "log-viewer",
        tabConfig: { system: "ext-a" },
        pinned: false,
      }),
    ]);
    mountLogTab("ext-a");
    await vi.waitFor(() => expect(find).toHaveBeenCalledWith("needle"));
  });
});

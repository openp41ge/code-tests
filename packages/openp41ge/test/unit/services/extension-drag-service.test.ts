/**
 * Unit tests for the extension drag service (Phase 2a): delegated source
 * detection, payload building, context gating, per-mount drop receivers and
 * innermost-first in-place delivery.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ILogger } from "openp41ge-core-logger";
import type { DragDecls, DragSourceDecl } from "openp41ge-sdk";
import {
  RendererDragService,
  LONG_PRESS_MS,
  buildDragPayload,
  type PayloadDragPipeline,
} from "@openp41ge/renderer/services/extension-drag-service";

const fileSource: DragSourceDecl = {
  id: "file",
  label: "File",
  kind: "openp41ge/file-path",
  attrs: { filePath: "data-path", fileName: "data-name" },
  contexts: ["workspace"],
};

const decls: DragDecls = {
  kinds: [],
  sources: [fileSource],
  consumers: [],
  dropTargets: [{ id: "attach", surface: "grid:chat", accepts: ["openp41ge/file-path"] }],
};

function makeLog(): ILogger {
  return { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } as unknown as ILogger;
}

function mousedown(el: Element, init: MouseEventInit = {}): MouseEvent {
  const ev = new MouseEvent("mousedown", {
    bubbles: true,
    composed: true,
    cancelable: true,
    button: 0,
    ...init,
  });
  el.dispatchEvent(ev);
  return ev;
}

describe("buildDragPayload", () => {
  it("reads mapped attributes into a validated payload", () => {
    const el = document.createElement("div");
    el.setAttribute("data-path", "/a/b.ts");
    el.setAttribute("data-name", "b.ts");
    expect(buildDragPayload(fileSource, el)).toEqual({
      kind: "openp41ge/file-path",
      filePath: "/a/b.ts",
      fileName: "b.ts",
    });
  });

  it("omits optional fields whose attribute is absent", () => {
    const el = document.createElement("div");
    el.setAttribute("data-path", "/a/b.ts");
    expect(buildDragPayload(fileSource, el)).toEqual({
      kind: "openp41ge/file-path",
      filePath: "/a/b.ts",
    });
  });

  it("throws when a required attribute is missing", () => {
    const el = document.createElement("div");
    expect(() => buildDragPayload(fileSource, el)).toThrow(/file/);
  });
});

describe("RendererDragService — sources", () => {
  let pipeline: PayloadDragPipeline & {
    startPayloadDrag: ReturnType<typeof vi.fn>;
    engageDrag: ReturnType<typeof vi.fn>;
  };
  let log: ILogger;
  let container: HTMLElement;

  beforeEach(() => {
    pipeline = { startPayloadDrag: vi.fn(), engageDrag: vi.fn(() => true) };
    log = makeLog();
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  function service(windowContext: "workspace" | "manager" | "logs" = "workspace") {
    const s = new RendererDragService({ getWindowContext: () => windowContext, pipeline, log });
    s.registerDecls("ext-a", decls);
    return s;
  }

  function row(id = "file", path = "/a/b.ts"): HTMLElement {
    const el = document.createElement("div");
    el.setAttribute("data-drag-source-id", id);
    el.setAttribute("data-path", path);
    const label = document.createElement("span");
    el.appendChild(label);
    return el;
  }

  it("starts a payload drag for a tagged element added AFTER mount", () => {
    const binding = service().forExtension("ext-a").attach("grid:chat", container);
    const el = row();
    container.appendChild(el);
    const ev = mousedown(el.firstElementChild!);
    expect(pipeline.startPayloadDrag).toHaveBeenCalledTimes(1);
    const req = pipeline.startPayloadDrag.mock.calls[0][0];
    expect(req.element).toBe(el);
    expect(req.source).toEqual(fileSource);
    expect(req.payload).toEqual({ kind: "openp41ge/file-path", filePath: "/a/b.ts" });
    expect(req.event).toBe(ev);
    expect(ev.defaultPrevented).toBe(true);
    binding.dispose();
  });

  it("starts the drag after a long-press without movement", () => {
    vi.useFakeTimers();
    try {
      const binding = service().forExtension("ext-a").attach("grid:chat", container);
      const el = row();
      container.appendChild(el);
      mousedown(el, { clientX: 5, clientY: 6, screenX: 105, screenY: 206 });
      vi.advanceTimersByTime(LONG_PRESS_MS - 1);
      expect(pipeline.engageDrag).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(pipeline.engageDrag).toHaveBeenCalledWith({
        clientX: 5,
        clientY: 6,
        screenX: 105,
        screenY: 206,
      });
      binding.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not long-press a gesture released before the hold, or a disposed mount", () => {
    vi.useFakeTimers();
    try {
      const binding = service().forExtension("ext-a").attach("grid:chat", container);
      const el = row();
      container.appendChild(el);
      mousedown(el);
      document.dispatchEvent(new MouseEvent("mouseup", { button: 0 }));
      vi.advanceTimersByTime(LONG_PRESS_MS);
      mousedown(el);
      binding.dispose();
      vi.advanceTimersByTime(LONG_PRESS_MS);
      expect(pipeline.engageDrag).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("finds tagged elements inside shadow roots", () => {
    service().forExtension("ext-a").attach("grid:chat", container);
    const host = document.createElement("div");
    container.appendChild(host);
    const shadow = host.attachShadow({ mode: "open" });
    const el = row();
    shadow.appendChild(el);
    mousedown(el);
    expect(pipeline.startPayloadDrag).toHaveBeenCalledTimes(1);
  });

  it("ignores non-primary buttons and untagged elements", () => {
    service().forExtension("ext-a").attach("grid:chat", container);
    const el = row();
    container.appendChild(el);
    mousedown(el, { button: 2 });
    const plain = document.createElement("div");
    container.appendChild(plain);
    mousedown(plain);
    expect(pipeline.startPayloadDrag).not.toHaveBeenCalled();
  });

  it("only resolves the extension's own source ids", () => {
    const s = service();
    s.registerDecls("ext-b", {
      kinds: [],
      sources: [{ ...fileSource, id: "other" }],
      consumers: [],
      dropTargets: [],
    });
    s.forExtension("ext-a").attach("grid:chat", container);
    const el = row("other");
    container.appendChild(el);
    mousedown(el);
    expect(pipeline.startPayloadDrag).not.toHaveBeenCalled();
  });

  it("does not start a drag that can land nowhere (context mismatch, not cross-window)", () => {
    service("manager").forExtension("ext-a").attach("grid:chat", container);
    const el = row();
    container.appendChild(el);
    mousedown(el);
    expect(pipeline.startPayloadDrag).not.toHaveBeenCalled();
  });

  it("starts a cross-window source even when this window's context does not match", () => {
    const s = new RendererDragService({ getWindowContext: () => "manager", pipeline, log });
    s.registerDecls("ext-a", { ...decls, sources: [{ ...fileSource, crossWindow: true }] });
    s.forExtension("ext-a").attach("grid:chat", container);
    const el = row();
    container.appendChild(el);
    mousedown(el);
    expect(pipeline.startPayloadDrag).toHaveBeenCalledTimes(1);
  });

  it("logs and does not drag when the payload is invalid", () => {
    service().forExtension("ext-a").attach("grid:chat", container);
    const el = row();
    el.removeAttribute("data-path");
    container.appendChild(el);
    mousedown(el);
    expect(pipeline.startPayloadDrag).not.toHaveBeenCalled();
    expect(log.error).toHaveBeenCalled();
  });

  it("removes the delegated listener on dispose", () => {
    const binding = service().forExtension("ext-a").attach("grid:chat", container);
    binding.dispose();
    const el = row();
    container.appendChild(el);
    mousedown(el);
    expect(pipeline.startPayloadDrag).not.toHaveBeenCalled();
  });

  it("forgets an extension's declarations on unregister (reload)", () => {
    const s = service();
    s.forExtension("ext-a").attach("grid:chat", container);
    s.unregisterDecls("ext-a");
    const el = row();
    container.appendChild(el);
    mousedown(el);
    expect(pipeline.startPayloadDrag).not.toHaveBeenCalled();
  });
});

describe("RendererDragService — drop targets", () => {
  let s: RendererDragService;

  beforeEach(() => {
    s = new RendererDragService({
      getWindowContext: () => "workspace",
      pipeline: { startPayloadDrag: vi.fn() },
      log: makeLog(),
    });
    s.registerDecls("ext-a", decls);
  });

  function mount(surface = "grid:chat") {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const zone = document.createElement("div");
    zone.setAttribute("data-drop-target-id", "attach");
    const inner = document.createElement("span");
    zone.appendChild(inner);
    container.appendChild(zone);
    const binding = s.forExtension("ext-a").attach(surface, container);
    return { container, zone, inner, binding };
  }

  const payload = { kind: "openp41ge/file-path", filePath: "/a.ts" } as const;

  it("delivers to the receiver of the mount under the cursor only", () => {
    const a = mount();
    const b = mount();
    const onDropA = vi.fn();
    const onDropB = vi.fn();
    a.binding.registerDropTarget("attach", { onDrop: onDropA });
    b.binding.registerDropTarget("attach", { onDrop: onDropB });
    expect(s.deliverDrop(b.inner, payload, { sourceId: "file" })).toBe(true);
    expect(onDropB).toHaveBeenCalledWith(payload, { sourceId: "file" });
    expect(onDropA).not.toHaveBeenCalled();
  });

  it("falls through (returns false) for a kind the target does not accept", () => {
    const a = mount();
    const onDrop = vi.fn();
    a.binding.registerDropTarget("attach", { onDrop });
    expect(
      s.deliverDrop(a.inner, { kind: "openp41ge/log-stream", system: "git" }, { sourceId: "x" }),
    ).toBe(false);
    expect(onDrop).not.toHaveBeenCalled();
  });

  it("falls through for an untagged area or an unbound target", () => {
    const a = mount();
    expect(s.deliverDrop(a.inner, payload, { sourceId: "file" })).toBe(false);
    const onDrop = vi.fn();
    a.binding.registerDropTarget("attach", { onDrop });
    expect(s.deliverDrop(a.container, payload, { sourceId: "file" })).toBe(false);
    expect(s.deliverDrop(document.body, payload, { sourceId: "file" })).toBe(false);
  });

  it("validates the payload before delivering", () => {
    const a = mount();
    const onDrop = vi.fn();
    a.binding.registerDropTarget("attach", { onDrop });
    expect(() =>
      s.deliverDrop(a.inner, { kind: "openp41ge/file-path", filePath: "" } as never, {
        sourceId: "file",
      }),
    ).toThrow();
    expect(onDrop).not.toHaveBeenCalled();
  });

  it("throws when registering an undeclared id or one declared for another surface", () => {
    const a = mount("sidebar:history");
    expect(() => a.binding.registerDropTarget("nope", { onDrop: vi.fn() })).toThrow(/nope/);
    expect(() => a.binding.registerDropTarget("attach", { onDrop: vi.fn() })).toThrow(
      /attach.*grid:chat.*sidebar:history/,
    );
  });

  it("stops delivering after deregister and after dispose", () => {
    const a = mount();
    const onDrop = vi.fn();
    const off = a.binding.registerDropTarget("attach", { onDrop });
    off();
    expect(s.deliverDrop(a.inner, payload, { sourceId: "file" })).toBe(false);
    a.binding.registerDropTarget("attach", { onDrop });
    a.binding.dispose();
    expect(s.deliverDrop(a.inner, payload, { sourceId: "file" })).toBe(false);
    expect(onDrop).not.toHaveBeenCalled();
  });

  it("findDropTarget returns the accepting target element without delivering", () => {
    const a = mount();
    const onDrop = vi.fn();
    a.binding.registerDropTarget("attach", { onDrop });
    const hit = s.findDropTarget(a.inner, payload);
    expect(hit?.element).toBe(a.zone);
    expect(onDrop).not.toHaveBeenCalled();
    hit!.deliver({ sourceId: "file" });
    expect(onDrop).toHaveBeenCalledWith(payload, { sourceId: "file" });
    expect(s.findDropTarget(a.inner, { kind: "openp41ge/log-stream", system: "git" })).toBeNull();
  });

  it("reads the window context lazily", () => {
    let ctx: "workspace" | "manager" = "manager";
    const pipeline = { startPayloadDrag: vi.fn() };
    const lazy = new RendererDragService({ getWindowContext: () => ctx, pipeline, log: makeLog() });
    lazy.registerDecls("ext-a", decls);
    const container = document.createElement("div");
    document.body.appendChild(container);
    lazy.forExtension("ext-a").attach("grid:chat", container);
    const el = document.createElement("div");
    el.setAttribute("data-drag-source-id", "file");
    el.setAttribute("data-path", "/a.ts");
    container.appendChild(el);
    ctx = "workspace";
    mousedown(el);
    expect(pipeline.startPayloadDrag).toHaveBeenCalledTimes(1);
  });

  it("finds the mount across a shadow boundary", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const host = document.createElement("div");
    container.appendChild(host);
    const shadow = host.attachShadow({ mode: "open" });
    const zone = document.createElement("div");
    zone.setAttribute("data-drop-target-id", "attach");
    shadow.appendChild(zone);
    const binding = s.forExtension("ext-a").attach("grid:chat", container);
    const onDrop = vi.fn();
    binding.registerDropTarget("attach", { onDrop });
    expect(s.deliverDrop(zone, payload, { sourceId: "file" })).toBe(true);
    expect(onDrop).toHaveBeenCalled();
  });
});

describe("RendererDragService — extension-declared kinds", () => {
  const ticket = {
    name: "ext-a/ticket",
    schema: {
      type: "object" as const,
      properties: { ticketId: { type: "string" as const }, title: { type: "string" as const } },
      required: ["ticketId"],
    },
  };
  const ticketSource: DragSourceDecl = {
    id: "ticket-row",
    label: "Ticket",
    kind: "ext-a/ticket",
    attrs: { ticketId: "data-id", title: "data-title" },
    contexts: ["workspace"],
  };

  it("drags an extension's own kind, validated against its schema", () => {
    const pipeline = { startPayloadDrag: vi.fn(), engageDrag: vi.fn(() => true) };
    const s = new RendererDragService({
      getWindowContext: () => "workspace",
      pipeline,
      log: makeLog(),
    });
    s.registerDecls("ext-a", {
      kinds: [ticket],
      sources: [ticketSource],
      consumers: [],
      dropTargets: [],
    });
    const container = document.createElement("div");
    document.body.appendChild(container);
    s.forExtension("ext-a").attach("grid:board", container);
    const row = document.createElement("div");
    row.setAttribute("data-drag-source-id", "ticket-row");
    row.setAttribute("data-id", "T-1");
    container.appendChild(row);
    mousedown(row);
    expect(pipeline.startPayloadDrag.mock.calls[0][0].payload).toEqual({
      kind: "ext-a/ticket",
      ticketId: "T-1",
    });
    // Missing its required field: no drag.
    row.removeAttribute("data-id");
    mousedown(row);
    expect(pipeline.startPayloadDrag).toHaveBeenCalledTimes(1);
  });

  it("delivers another extension's kind to a target that accepts it", () => {
    const s = new RendererDragService({
      getWindowContext: () => "workspace",
      pipeline: { startPayloadDrag: vi.fn(), engageDrag: vi.fn(() => true) },
      log: makeLog(),
    });
    s.registerDecls("ext-a", {
      kinds: [ticket],
      sources: [ticketSource],
      consumers: [],
      dropTargets: [],
    });
    s.registerDecls("ext-b", {
      kinds: [],
      sources: [],
      consumers: [],
      dropTargets: [{ id: "inbox", surface: "grid:inbox", accepts: ["ext-a/ticket"] }],
    });
    const container = document.createElement("div");
    document.body.appendChild(container);
    const zone = document.createElement("div");
    zone.setAttribute("data-drop-target-id", "inbox");
    container.appendChild(zone);
    const onDrop = vi.fn();
    s.forExtension("ext-b").attach("grid:inbox", container).registerDropTarget("inbox", { onDrop });
    const payload = { kind: "ext-a/ticket", ticketId: "T-2" };
    expect(s.deliverDrop(zone, payload, { sourceId: "ticket-row" })).toBe(true);
    expect(onDrop).toHaveBeenCalledWith(payload, { sourceId: "ticket-row" });
  });
});

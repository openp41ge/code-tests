/**
 * Unit tests for the extension drag runtime (composition of the consumer
 * registry, drag service and grid payload resolver).
 */
import { describe, it, expect, vi } from "vitest";
import type { ILogger } from "openp41ge-core-logger";
import type { DragDecls } from "openp41ge-sdk";
import type { PayloadDragData } from "openp41ge-core-tabs/interfaces";
import { createExtensionDragRuntime } from "@openp41ge/renderer/services/extension-drag";

function makeLog(): ILogger {
  return { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } as unknown as ILogger;
}

const decls: DragDecls = {
  kinds: [],
  sources: [
    {
      id: "file",
      label: "File",
      kind: "openp41ge/file-path",
      attrs: { filePath: "data-path" },
      contexts: ["workspace"],
      crossWindow: true,
    },
  ],
  consumers: [
    {
      id: "viewer",
      accepts: ["openp41ge-extension-agents/chat-thread"],
      placement: ["grid"],
      open: { kind: "renderer-surface", surface: "grid:viewer" },
    },
  ],
  dropTargets: [{ id: "attach", surface: "grid:viewer", accepts: ["openp41ge/file-path"] }],
};

const filePayload: PayloadDragData = {
  type: "payload",
  payload: { kind: "openp41ge/file-path", filePath: "/a.ts" },
  sourceId: "file",
  contexts: ["workspace"],
};

describe("createExtensionDragRuntime — consumer choices", () => {
  it("lists each kind with its label and its consumers with theirs", () => {
    const rt = createExtensionDragRuntime({ log: makeLog() });
    rt.registerExtension(
      "ext-a",
      {
        ...decls,
        kinds: [
          { name: "ext-a/ticket", label: "Ticket", schema: { type: "object", properties: {} } },
        ],
        consumers: [
          {
            id: "tickets",
            label: "Tickets",
            accepts: ["ext-a/ticket"],
            placement: ["grid"],
            open: { kind: "renderer-surface", surface: "grid:viewer" },
          },
        ],
        dropTargets: [],
      },
      ["grid:viewer"],
    );
    const choices = rt.consumerChoices.choices();
    expect(choices.find((c) => c.kind === "openp41ge/file-path")).toEqual({
      kind: "openp41ge/file-path",
      label: "File",
      consumers: [{ id: "file-viewer", label: "File viewer" }],
    });
    expect(choices.find((c) => c.kind === "ext-a/ticket")).toEqual({
      kind: "ext-a/ticket",
      label: "Ticket",
      consumers: [{ id: "ext-a/tickets", label: "Tickets" }],
    });
  });

  it("tells its listeners when an extension registers", () => {
    const rt = createExtensionDragRuntime({ log: makeLog() });
    const seen = vi.fn();
    rt.consumerChoices.onChange(seen);
    rt.registerExtension("ext-a", decls, ["grid:viewer"]);
    expect(seen).toHaveBeenCalled();
  });
});

describe("createExtensionDragRuntime", () => {
  it("registers platform consumers first", () => {
    const rt = createExtensionDragRuntime({ log: makeLog() });
    expect(
      rt.registry.resolve({ kind: "openp41ge/file-path", filePath: "/a.ts" }, "grid")?.appType,
    ).toBe("file-viewer");
  });

  it("registers an extension's decls when its surfaces exist", () => {
    const rt = createExtensionDragRuntime({ log: makeLog() });
    rt.registerExtension("ext-a", decls, ["grid:viewer"]);
    expect(
      rt.registry.resolve({ kind: "openp41ge-extension-agents/chat-thread", chatId: "c" }, "grid")
        ?.consumerId,
    ).toBe("ext-a/viewer");
    expect(rt.binderFor("ext-a")).toBeDefined();
  });

  it("rejects decls that name surfaces the extension does not register, registering nothing", () => {
    const rt = createExtensionDragRuntime({ log: makeLog() });
    expect(() => rt.registerExtension("ext-a", decls, ["grid:other"])).toThrow(/grid:viewer/);
    const container = document.createElement("div");
    const binding = rt.binderFor("ext-a").attach("grid:viewer", container);
    expect(() => binding.registerDropTarget("attach", { onDrop: vi.fn() })).toThrow(
      /not a declared/,
    );
  });

  it("unregisterExtension forgets its consumers and decls", () => {
    const rt = createExtensionDragRuntime({
      log: makeLog(),
      getOverrides: () => ({ "openp41ge-extension-agents/chat-thread": "ext-a/viewer" }),
    });
    rt.registerExtension("ext-a", decls, ["grid:viewer"]);
    expect(
      rt.registry.resolve({ kind: "openp41ge-extension-agents/chat-thread", chatId: "c" }, "grid")
        ?.consumerId,
    ).toBe("ext-a/viewer");
    rt.unregisterExtension("ext-a");
    expect(
      rt.registry.resolve({ kind: "openp41ge-extension-agents/chat-thread", chatId: "c" }, "grid"),
    ).toBeNull();
  });

  it("resolveGridOpen is gated by the window context set by init", () => {
    const rt = createExtensionDragRuntime({ log: makeLog() });
    const target = { winId: "w", element: document.createElement("div") };
    rt.init({ windowContext: "manager", pipeline: { startPayloadDrag: vi.fn() } });
    expect(rt.resolveGridOpen(filePayload, target)).toBeNull();
    rt.init({ windowContext: "workspace", pipeline: { startPayloadDrag: vi.fn() } });
    expect(rt.resolveGridOpen(filePayload, target)).toEqual({
      appType: "file-viewer",
      tabConfig: { filePath: "/a.ts" },
    });
  });

  it("routes source drags to the pipeline installed by init", () => {
    const rt = createExtensionDragRuntime({ log: makeLog() });
    rt.registerExtension("ext-a", decls, ["grid:viewer"]);
    const container = document.createElement("div");
    document.body.appendChild(container);
    rt.binderFor("ext-a").attach("grid:viewer", container);
    const el = document.createElement("div");
    el.setAttribute("data-drag-source-id", "file");
    el.setAttribute("data-path", "/a.ts");
    container.appendChild(el);
    const pipeline = { startPayloadDrag: vi.fn() };
    rt.init({ windowContext: "workspace", pipeline });
    el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, composed: true, button: 0 }));
    expect(pipeline.startPayloadDrag).toHaveBeenCalledTimes(1);
  });
});

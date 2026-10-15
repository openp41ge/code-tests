/**
 * Unit tests for consumer resolution (Phase 3): kind → consumer → what to open.
 */
import { describe, it, expect, vi } from "vitest";
import type { DragConsumerDecl } from "openp41ge-sdk";
import {
  DragConsumerRegistry,
  type PlatformDragConsumer,
} from "@openp41ge/renderer/services/drag-consumer-registry";
import { PLATFORM_DRAG_CONSUMERS } from "@openp41ge/renderer/services/platform-drag-consumers";

const fileViewer: PlatformDragConsumer = {
  id: "file-viewer",
  accepts: ["openp41ge/file-path"],
  placement: ["grid"],
  open: { kind: "app", appType: "file-viewer" },
  toTabConfig: (p) => ({ filePath: (p as { filePath: string }).filePath }),
};

const extViewer: DragConsumerDecl = {
  id: "viewer",
  accepts: ["openp41ge/file-path"],
  placement: ["grid"],
  open: { kind: "renderer-surface", surface: "grid:viewer" },
};

const file = { kind: "openp41ge/file-path", filePath: "/a/b.ts" } as const;

function registry(overrides: Record<string, string> = {}, log = { warn: vi.fn() }) {
  return new DragConsumerRegistry({ getOverrides: () => overrides, log });
}

describe("DragConsumerRegistry", () => {
  it("resolves a platform app consumer to its app type and tab config", () => {
    const r = registry();
    r.registerPlatform([fileViewer]);
    expect(r.resolve(file, "grid")).toEqual({
      consumerId: "file-viewer",
      appType: "file-viewer",
      tabConfig: { filePath: "/a/b.ts" },
    });
  });

  it("returns null when no consumer accepts the kind", () => {
    const r = registry();
    r.registerPlatform([fileViewer]);
    expect(
      r.resolve({ kind: "openp41ge-extension-agents/chat-thread", chatId: "c" }, "grid"),
    ).toBeNull();
  });

  it("first registered wins: platform consumers beat a later extension consumer", () => {
    const r = registry();
    r.registerPlatform([fileViewer]);
    r.registerExtension("ext-a", [extViewer]);
    expect(r.resolve(file, "grid")?.consumerId).toBe("file-viewer");
  });

  it("a user-config override selects an extension consumer by qualified id", () => {
    const r = registry({ "openp41ge/file-path": "ext-a/viewer" });
    r.registerPlatform([fileViewer]);
    r.registerExtension("ext-a", [extViewer]);
    expect(r.resolve(file, "grid")).toEqual({
      consumerId: "ext-a/viewer",
      appType: "ext:ext-a:viewer",
      // The payload's fields (not its kind) are the tab's data.
      tabConfig: { filePath: "/a/b.ts" },
    });
  });

  it("an unknown override id warns and falls back to first registered", () => {
    const log = { warn: vi.fn() };
    const r = registry({ "openp41ge/file-path": "nope" }, log);
    r.registerPlatform([fileViewer]);
    expect(r.resolve(file, "grid")?.consumerId).toBe("file-viewer");
    expect(log.warn).toHaveBeenCalled();
  });

  it("an override naming a consumer that does not accept the kind falls back", () => {
    const r = registry({ "openp41ge/file-path": "ext-a/viewer" });
    r.registerPlatform([fileViewer]);
    r.registerExtension("ext-a", [
      { ...extViewer, accepts: ["openp41ge-extension-agents/chat-thread"] },
    ]);
    expect(r.resolve(file, "grid")?.consumerId).toBe("file-viewer");
  });

  it("ignores consumers without the requested placement", () => {
    const r = registry();
    r.registerExtension("ext-a", [{ ...extViewer, placement: ["sidebar"] }]);
    expect(r.resolve(file, "grid")).toBeNull();
  });

  it("does not open a sidebar renderer surface as a grid app", () => {
    const r = registry();
    r.registerExtension("ext-a", [
      { ...extViewer, open: { kind: "renderer-surface", surface: "sidebar:viewer" } },
    ]);
    expect(r.resolve(file, "grid")).toBeNull();
  });

  it("unregister removes an extension's consumers", () => {
    const r = registry();
    r.registerExtension("ext-a", [extViewer]);
    r.unregister("ext-a");
    expect(r.resolve(file, "grid")).toBeNull();
  });

  it("re-registering an extension replaces its consumers", () => {
    const r = registry();
    r.registerExtension("ext-a", [extViewer]);
    r.registerExtension("ext-a", [
      { ...extViewer, accepts: ["openp41ge-extension-agents/chat-thread"] },
    ]);
    expect(r.resolve(file, "grid")).toBeNull();
  });

  it("exposes all consumers with globally-unique surfaces for the conflict check", () => {
    const r = registry();
    r.registerPlatform([fileViewer]);
    r.registerExtension("ext-a", [extViewer]);
    expect(r.allForConflictCheck().map((c) => c.open)).toEqual([
      { kind: "app", appType: "file-viewer" },
      { kind: "renderer-surface", surface: "ext-a/grid:viewer" },
    ]);
  });
});

describe("DragConsumerRegistry — choices", () => {
  it("lists each kind with the consumers that can open it in the grid, first registered first", () => {
    const r = registry();
    r.registerPlatform([fileViewer]);
    r.registerExtension("my-ext", [
      { ...extViewer, label: "Viewer" },
      // Opens only in a sidebar: no choice for a grid drop.
      {
        ...extViewer,
        id: "side",
        placement: ["sidebar"],
        open: { kind: "renderer-surface", surface: "sidebar:side" },
      },
      {
        id: "chat",
        accepts: ["my-ext/chat"],
        placement: ["grid"],
        open: { kind: "renderer-surface", surface: "grid:chat" },
      },
    ]);
    expect([...r.choices()]).toEqual([
      ["openp41ge/file-path", [{ id: "file-viewer" }, { id: "my-ext/viewer", label: "Viewer" }]],
      ["my-ext/chat", [{ id: "my-ext/chat" }]],
    ]);
  });

  it("tells its listeners when an extension's consumers come or go", () => {
    const r = registry();
    const seen = vi.fn();
    const off = r.onChange(seen);
    r.registerExtension("my-ext", [extViewer]);
    r.unregister("my-ext");
    expect(seen).toHaveBeenCalledTimes(2);
    off();
    r.registerExtension("my-ext", [extViewer]);
    expect(seen).toHaveBeenCalledTimes(2);
  });
});

describe("PLATFORM_DRAG_CONSUMERS", () => {
  function open(payload: Parameters<DragConsumerRegistry["resolve"]>[0]) {
    const r = registry();
    r.registerPlatform(PLATFORM_DRAG_CONSUMERS);
    return r.resolve(payload, "grid");
  }

  it("maps each platform kind to the existing app and tab config", () => {
    expect(
      open({ kind: "openp41ge/file-path", filePath: "/a.ts", fileName: "a.ts" }),
    ).toMatchObject({
      appType: "file-viewer",
      tabConfig: { filePath: "/a.ts" },
    });
    expect(open({ kind: "openp41ge/log-stream", system: "git" })).toMatchObject({
      appType: "log-viewer",
      tabConfig: { system: "git" },
    });
    expect(
      open({ kind: "openp41ge/config-overrides", settingsId: "my-ext", label: "Mine" }),
    ).toMatchObject({
      appType: "config-editor",
      tabConfig: { extensionId: "my-ext" },
    });
  });

  it("leaves repositories, commits and chats to their extensions (their tabs open them)", () => {
    expect(open({ kind: "openp41ge-extension-git/repository", repoName: "r" })).toBeNull();
    expect(
      open({ kind: "openp41ge-extension-git/commit", repoName: "r", hash: "abc1234def" }),
    ).toBeNull();
    expect(open({ kind: "openp41ge-extension-agents/chat-thread", chatId: "c1" })).toBeNull();
  });
});

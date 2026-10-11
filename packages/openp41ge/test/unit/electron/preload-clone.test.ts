/**
 * The preload's `workspaceController.clone`: its progress listener lives only
 * as long as the clone. (Regression: it stayed until `destroy()`, which only a
 * cancel calls, so every clone — one per repo each time a workspace opens —
 * left a listener behind: MaxListenersExceededWarning.)
 */
import { describe, it, expect } from "vitest";
import { EventEmitter } from "events";
import { createRequire } from "module";
import path from "path";
import { inApp } from "@app-tests/support";

/** This test's directory in the app checkout (it reads app files). */
const APP_HERE = inApp(__dirname);

const PRELOAD = path.resolve(APP_HERE, "../../../electron/preload.cjs");
// Resolve `electron` where the preload does, so the fake replaces its copy.
const require = createRequire(PRELOAD);

type Clone = (
  url: string,
  workspaceFile?: string,
) => {
  promise: Promise<unknown>;
  onProgress(fn: (p: unknown) => void): () => void;
  destroy(): void;
};

/** Load the preload against a fake `electron`; returns its clone and the IPC. */
function loadPreload(invoke: (...args: unknown[]) => Promise<unknown>) {
  const ipcRenderer = Object.assign(new EventEmitter(), { invoke, send() {}, sendSync() {} });
  let api: Record<string, Record<string, unknown>> = {};
  const electron = require.resolve("electron");
  require.cache[electron] = {
    exports: {
      ipcRenderer,
      contextBridge: { exposeInMainWorld: (_k: string, v: typeof api) => (api = v) },
      webUtils: { getPathForFile: () => "" },
    },
  } as NodeJS.Module;
  delete require.cache[PRELOAD];
  try {
    require(PRELOAD);
  } finally {
    delete require.cache[electron];
  }
  return { clone: api.workspaceController.clone as Clone, ipcRenderer };
}

describe("preload workspaceController.clone", () => {
  it("removes its progress listener when the clone settles", async () => {
    const { clone, ipcRenderer } = loadPreload(async () => ({ success: true }));
    const sessions = Array.from({ length: 12 }, () => clone("git@github.com:acme/app.git"));
    await Promise.all(sessions.map((s) => s.promise));
    expect(ipcRenderer.listenerCount("workspace:clone-progress")).toBe(0);
  });

  it("removes it when the clone fails too", async () => {
    const { clone, ipcRenderer } = loadPreload(async () => {
      throw new Error("gone");
    });
    await expect(clone("git@github.com:acme/app.git").promise).rejects.toThrow("gone");
    expect(ipcRenderer.listenerCount("workspace:clone-progress")).toBe(0);
  });

  it("reports progress while the clone runs", async () => {
    let finish!: (v: unknown) => void;
    let cloneId: unknown;
    const { clone, ipcRenderer } = loadPreload((_channel, _url, _file, id) => {
      cloneId = id;
      return new Promise((r) => (finish = r));
    });
    const session = clone("git@github.com:acme/app.git");
    const seen: unknown[] = [];
    session.onProgress((p) => seen.push(p));
    ipcRenderer.emit("workspace:clone-progress", {}, { cloneId, percent: 40, message: "x" });
    finish({ success: true });
    await session.promise;
    expect(seen).toEqual([{ percent: 40, message: "x" }]);
  });

  it("reports only its own clone's progress when two run at once", async () => {
    const cloneIds: unknown[] = [];
    const { clone, ipcRenderer } = loadPreload((_channel, _url, _file, cloneId) => {
      cloneIds.push(cloneId);
      return new Promise(() => undefined);
    });
    const a = clone("git@github.com:acme/a.git");
    const b = clone("git@github.com:acme/b.git");
    const seenA: unknown[] = [];
    const seenB: unknown[] = [];
    a.onProgress((p) => seenA.push(p));
    b.onProgress((p) => seenB.push(p));
    const [idA, idB] = cloneIds;
    expect(typeof idA).toBe("string");
    expect(idA).not.toBe(idB);
    ipcRenderer.emit("workspace:clone-progress", {}, { cloneId: idA, percent: 10, message: "a" });
    ipcRenderer.emit("workspace:clone-progress", {}, { cloneId: idB, percent: 70, message: "b" });
    expect(seenA).toEqual([{ percent: 10, message: "a" }]);
    expect(seenB).toEqual([{ percent: 70, message: "b" }]);
  });
});

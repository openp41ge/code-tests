// @ts-nocheck
/**
 * Unit tests for the fatal-error-window manager.
 *
 * `showFatalErrorWindow` creates a standalone BrowserWindow, sends the fatal
 * payload on load, and (via the close handler) exits the app. The module is
 * stubbed the same way the confirm-dialog tests stub electron.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock state (hoisted so the vi.mock factory can capture it) ──────────
const state = vi.hoisted(() => {
  const instances = [];
  const didFinishLoadCallbacks = [];
  const onAck = vi.fn();
  const exit = vi.fn();
  let registeredHandler = null;

  class FakeBrowserWindow {
    destroyed = false;
    webContents = {
      once: vi.fn((event, cb) => {
        if (event === "did-finish-load") didFinishLoadCallbacks.push(cb);
      }),
      send: vi.fn(),
    };
    constructor(opts) {
      this.opts = opts;
      instances.push(this);
    }
    once(event, cb) {
      if (event === "ready-to-show") this.readyToShow = cb;
      if (event === "closed") this.closedCb = cb;
      return this;
    }
    on(event, cb) {
      if (event === "closed") this.closedCb = cb;
      return this;
    }
    isDestroyed() {
      return this.destroyed;
    }
    destroy() {
      this.destroyed = true;
    }
    close() {
      this.destroyed = true;
      if (this.closedCb) this.closedCb();
    }
    show() {}
    focus() {}
    loadFile = vi.fn();
    loadURL = vi.fn();
    static reset() {
      instances.length = 0;
      didFinishLoadCallbacks.length = 0;
      onAck.mockReset();
      exit.mockReset();
      registeredHandler = null;
    }
  }

  return {
    FakeBrowserWindow,
    instances,
    didFinishLoadCallbacks,
    onAck,
    exit,
    get registeredHandler() {
      return registeredHandler;
    },
    set registeredHandler(v) {
      registeredHandler = v;
    },
  };
});

vi.mock("electron", () => ({
  app: {
    isPackaged: true, // production by default; tests flip this to test dev mode
    exit: state.exit,
  },
  BrowserWindow: state.FakeBrowserWindow,
  ipcMain: {
    on: vi.fn((channel, cb) => {
      if (channel === "fatal:ack") state.registeredHandler = cb;
    }),
    removeAllListeners: vi.fn(),
  },
}));

import {
  registerFatalHandlers,
  showFatalErrorWindow,
  isFatalWindowOpen,
  _closeFatalWindowForTests,
  _resetFatalManagerForTests,
} from "../../../electron/fatal-error-manager.js";

import { app as mockedApp } from "electron";

beforeEach(() => {
  state.FakeBrowserWindow.reset();
  _resetFatalManagerForTests();
  mockedApp.isPackaged = true; // default to production
});

describe("registerFatalHandlers", () => {
  it("registers the fatal:ack handler once (idempotent)", () => {
    registerFatalHandlers(state.onAck);
    registerFatalHandlers(state.onAck); // second call is a no-op
    expect(state.registeredHandler).toBeTypeOf("function");
  });

  it("calls onAcknowledge when the user acknowledges", () => {
    registerFatalHandlers(state.onAck);
    state.registeredHandler();
    expect(state.onAck).toHaveBeenCalledWith(1);
  });
});

describe("showFatalErrorWindow", () => {
  it("creates one parentless frameless always-on-top window", () => {
    registerFatalHandlers(state.onAck);
    showFatalErrorWindow({ message: "boom", stack: "s" });
    expect(state.instances).toHaveLength(1);
    const win = state.instances[0];
    expect(win.opts.frame).toBe(false);
    expect(win.opts.alwaysOnTop).toBe(true);
    expect(win.opts.parent).toBeUndefined(); // NO parent — macOS dim-layer bug
  });

  it("sends a generic message (no stack) in production — does not leak the error", () => {
    // isPackaged defaults to true (production)
    registerFatalHandlers(state.onAck);
    showFatalErrorWindow({ message: "boom", stack: "secret stack" });
    const win = state.instances[0];
    state.didFinishLoadCallbacks.forEach((cb) => cb());
    expect(win.webContents.send).toHaveBeenCalledWith(
      "fatal:show",
      JSON.stringify({
        message: "The application encountered an unrecoverable error and must close.",
        stack: undefined,
        timestamp: undefined,
      }),
    );
  });

  it("sends the real message + stack in a dev build", () => {
    mockedApp.isPackaged = false;
    registerFatalHandlers(state.onAck);
    showFatalErrorWindow({ message: "boom", stack: "stack!" });
    const win = state.instances[0];
    state.didFinishLoadCallbacks.forEach((cb) => cb());
    expect(win.webContents.send).toHaveBeenCalledWith(
      "fatal:show",
      JSON.stringify({ message: "boom", stack: "stack!" }),
    );
  });

  it("loads dist/fatal.html in production and the dev URL in dev", () => {
    registerFatalHandlers(state.onAck);
    showFatalErrorWindow({ message: "x" });
    const prod = state.instances[0];
    expect(prod.loadFile).toHaveBeenCalled();
    expect(prod.loadURL).not.toHaveBeenCalled();

    _closeFatalWindowForTests();
    _resetFatalManagerForTests();
    mockedApp.isPackaged = false;
    showFatalErrorWindow({ message: "x" });
    const dev = state.instances[1];
    expect(dev.loadURL).toHaveBeenCalledWith("http://localhost:8642/fatal.html");
    expect(dev.loadFile).not.toHaveBeenCalled();
  });

  it("is idempotent — a second fatal error does not open a second window", () => {
    registerFatalHandlers(state.onAck);
    showFatalErrorWindow({ message: "one" });
    showFatalErrorWindow({ message: "two" });
    expect(state.instances).toHaveLength(1);
  });

  it("is fatal-window-open reflects live state", () => {
    registerFatalHandlers(state.onAck);
    showFatalErrorWindow({ message: "boom" });
    expect(isFatalWindowOpen()).toBe(true);
  });

  it("calls app.exit(1) when the window is closed (treat as acknowledge)", () => {
    registerFatalHandlers(state.onAck);
    showFatalErrorWindow({ message: "boom" });
    const win = state.instances[0];
    win.close();
    expect(state.exit).toHaveBeenCalledWith(1);
  });

  it("closing and re-showing resets state (no permanent lockout)", () => {
    registerFatalHandlers(state.onAck);
    showFatalErrorWindow({ message: "boom" });
    _closeFatalWindowForTests();
    expect(isFatalWindowOpen()).toBe(false);
    showFatalErrorWindow({ message: "again" });
    expect(state.instances).toHaveLength(2);
  });
});

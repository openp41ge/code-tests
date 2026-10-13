/**
 * The migration window's view: only progress — a bar and "n of N" while the
 * updates run, never what they are. On a failure it says so and suggests
 * downloading the app again from GitHub (Download / Quit); offline and a
 * failed check say so plainly, with Quit / Retry. The status is on the
 * right of the top bar (red / green); the bottom bar holds only buttons,
 * each with the app's tooltip. Offline, the status follows the connection.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { tooltipController } from "openp41ge-sdk-uikit";
import { renderMigrations } from "@openp41ge/renderer/migrations-view";

function setup(state: Parameters<typeof renderMigrations>[1], opts: { online?: boolean } = {}) {
  const root = document.createElement("div");
  const actions = { retry: vi.fn(), quit: vi.fn(), download: vi.fn() };
  renderMigrations(root, state, actions, opts);
  return { root, actions };
}

afterEach(() => {
  tooltipController._host = null;
});

const bar = (root: HTMLElement) => root.querySelector<HTMLElement>('[role="progressbar"]');

describe("renderMigrations", () => {
  it("while updating: a progress bar and n of N, no buttons", () => {
    const { root } = setup({ phase: "running", completed: 1, total: 3 });
    expect(bar(root)?.getAttribute("aria-valuenow")).toBe("1");
    expect(bar(root)?.getAttribute("aria-valuemax")).toBe("3");
    expect(root.querySelector(".mg-status")?.textContent).toBe("1 of 3 done");
    expect(root.querySelector("[data-action]")).toBeNull();
  });

  it("when done: a full bar and Done", () => {
    const { root } = setup({ phase: "done", completed: 3, total: 3 });
    expect(bar(root)?.getAttribute("aria-valuenow")).toBe("3");
    expect(root.querySelector(".mg-status")?.textContent).toBe("Done");
  });

  it("on failure: says so and suggests downloading the app again from GitHub", () => {
    const { root, actions } = setup({ phase: "failed", completed: 1, total: 3 });
    expect(root.textContent).toContain("needs to update your data");
    expect(root.textContent).toContain("couldn't be finished");
    expect(root.textContent).toContain("GitHub");
    expect(root.querySelector('[data-action="retry"]')).toBeNull();
    expect(root.querySelector('[data-action="show-journal"]')).toBeNull();
    (root.querySelector('[data-action="download"]') as HTMLElement).click();
    (root.querySelector('[data-action="quit"]') as HTMLElement).click();
    expect(actions.download).toHaveBeenCalled();
    expect(actions.quit).toHaveBeenCalled();
  });
});

describe("renderMigrations — downloading", () => {
  it("offline: says it needs the internet once, with Quit and Retry", () => {
    const { root, actions } = setup({ phase: "offline", completed: 0, total: 0 }, { online: false });
    expect(root.textContent).toContain("needs to be online");
    expect(root.querySelector(".mg-status")?.textContent).toBe("Offline");
    (root.querySelector('[data-action="retry"]') as HTMLElement).click();
    expect(actions.retry).toHaveBeenCalled();
  });

  it("checking: says it is downloading, no buttons", () => {
    const { root } = setup({ phase: "checking", completed: 0, total: 0 });
    expect(root.querySelector(".mg-status")?.textContent).toBe("Downloading the update…");
    expect(root.querySelector("[data-action]")).toBeNull();
  });
});

describe("renderMigrations — refusing to open", () => {
  it("newer data: names the version that last used it, Quit only", () => {
    const { root, actions } = setup({ phase: "newer", completed: 0, total: 0, dataVersion: "0.3.0" });
    expect(root.textContent).toContain("0.3.0");
    expect(root.querySelector('[data-action="retry"]')).toBeNull();
    (root.querySelector('[data-action="quit"]') as HTMLElement).click();
    expect(actions.quit).toHaveBeenCalled();
  });

  it("a failed check: says so plainly, with Quit and Retry", () => {
    const { root } = setup({ phase: "error", completed: 0, total: 0 });
    expect(root.textContent).toContain("couldn't check");
    expect(root.querySelector('[data-action="retry"]')).not.toBeNull();
    expect(root.querySelector('[data-action="quit"]')).not.toBeNull();
  });
});

describe("renderMigrations — top bar status and buttons", () => {
  const status = (root: HTMLElement) => root.querySelector<HTMLElement>(".mg-titlebar .mg-status");

  it("the status is in the top bar; the bottom bar has only buttons", () => {
    const { root } = setup({ phase: "offline", completed: 0, total: 0 }, { online: false });
    expect(status(root)?.textContent).toBe("Offline");
    expect(root.querySelector(".mg-bottombar")!.textContent!.trim()).toBe("");
  });

  it("offline: Offline in red, and Online in green once the connection is back", () => {
    const off = setup({ phase: "offline", completed: 0, total: 0 }, { online: false }).root;
    expect(status(off)?.textContent).toBe("Offline");
    expect(status(off)?.classList.contains("mg-status--bad")).toBe(true);
    const on = setup({ phase: "offline", completed: 0, total: 0 }, { online: true }).root;
    expect(status(on)?.textContent).toBe("Online");
    expect(status(on)?.classList.contains("mg-status--ok")).toBe(true);
  });

  it("no bottom bar when there are no buttons", () => {
    const { root } = setup({ phase: "running", completed: 1, total: 3 });
    expect(root.querySelector(".mg-bottombar")).toBeNull();
    expect(status(root)?.textContent).toBe("1 of 3 done");
  });

  it("the buttons show the app's tooltip, not the native one", () => {
    const host = { show: vi.fn(), hide: vi.fn() };
    tooltipController._host = host;
    const { root } = setup({ phase: "offline", completed: 0, total: 0 }, { online: false });
    for (const [action, text] of [
      ["quit", "Quit"],
      ["retry", "Retry"],
    ]) {
      const button = root.querySelector<HTMLElement>(`[data-action="${action}"]`)!;
      expect(button.hasAttribute("title")).toBe(false);
      button.dispatchEvent(new MouseEvent("mouseenter"));
      expect(host.show).toHaveBeenLastCalledWith(button, { type: "simple", text });
    }
  });
});

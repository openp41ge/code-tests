/**
 * The migration window's view: only progress — a bar and "n of N" while the
 * updates run, never what they are. On a failure it says so and suggests
 * downloading the app again from GitHub (Download / Quit); offline and a
 * failed check say so plainly, with Quit / Retry.
 */
import { describe, it, expect, vi } from "vitest";
import { renderMigrations } from "@openp41ge/renderer/migrations-view";

function setup(state: Parameters<typeof renderMigrations>[1]) {
  const root = document.createElement("div");
  const actions = { retry: vi.fn(), quit: vi.fn(), download: vi.fn() };
  renderMigrations(root, state, actions);
  return { root, actions };
}

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
    const { root, actions } = setup({ phase: "offline", completed: 0, total: 0 });
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

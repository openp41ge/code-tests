/**
 * The migration window's view: only progress — a bar and "n of N" while the
 * updates run, never what they are. On a failure it says so and suggests
 * downloading the app again from GitHub (Download / Quit); offline and a
 * failed check say so plainly, with Quit / Continue. Offline, a checklist
 * shows what the download needs (internet, GitHub), and Continue is
 * disabled until every item is met. Otherwise the status is right below
 * the text (red / green); the top bar holds only the title. The bottom bar
 * holds only buttons, each with the app's tooltip.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { tooltipController } from "openp41ge-sdk-uikit";
import { renderMigrations } from "@openp41ge/renderer/migrations-view";

function setup(state: Parameters<typeof renderMigrations>[1]) {
  const root = document.createElement("div");
  const actions = { retry: vi.fn(), quit: vi.fn(), download: vi.fn() };
  renderMigrations(root, state, actions);
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
  it("offline: says it needs to download an update, with Quit and Continue", () => {
    const { root } = setup({ phase: "offline", completed: 0, total: 0 });
    expect(root.textContent).toContain("needs to download an update to your data");
    expect(root.querySelector('[data-action="quit"]')).not.toBeNull();
    expect(root.querySelector('[data-action="retry"]')).not.toBeNull();
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

describe("renderMigrations — offline: what the download needs", () => {
  const offline = (requirements?: object) =>
    setup({ phase: "offline", completed: 0, total: 0, ...(requirements ? { requirements } : {}) } as never);
  const items = (root: HTMLElement) =>
    [...root.querySelectorAll<HTMLElement>(".mg-check")].map((i) => ({
      text: i.textContent?.trim(),
      state: i.dataset.state,
    }));
  const next = (root: HTMLElement) => root.querySelector<HTMLElement>('[data-action="retry"]')!;

  it("a checklist below the text: internet and GitHub; no status in the top bar", () => {
    const { root } = offline({ internet: false, github: "unreachable" });
    expect(items(root)).toEqual([
      { text: "Not connected to the internet", state: "bad" },
      { text: "Distribution servers can't be reached", state: "bad" },
    ]);
    expect(root.querySelector(".mg-titlebar .mg-status")).toBeNull();
    expect(root.querySelector(".mg-body .mg-checklist")).not.toBeNull();
  });

  it("before the first check: both are being checked", () => {
    const { root } = offline();
    expect(items(root).map((i) => i.state)).toEqual(["checking", "checking"]);
    expect(next(root).getAttribute("aria-disabled")).toBe("true");
  });

  it("being checked (the connection just came back): a blue spinner", () => {
    const { root } = offline({ internet: true, github: "checking" });
    expect(items(root)).toEqual([
      { text: "Connected to the internet", state: "ok" },
      { text: "Checking the distribution servers…", state: "checking" },
    ]);
    expect(root.querySelectorAll(".mg-check[data-state=checking] .mg-spinner")).toHaveLength(1);
    expect(next(root).getAttribute("aria-disabled")).toBe("true");
  });

  it("before the first check: spinners on both", () => {
    const { root } = offline();
    expect(root.querySelectorAll(".mg-spinner")).toHaveLength(2);
  });

  it("rate limited: says until when", () => {
    const at = new Date(2026, 9, 13, 14, 5).getTime();
    const { root } = offline({ internet: true, github: "rate-limited", githubResetAt: at });
    expect(items(root)[0]).toEqual({ text: "Connected to the internet", state: "ok" });
    expect(items(root)[1].state).toBe("bad");
    expect(items(root)[1].text).toContain("The distribution servers have limited requests from this network");
    // In the computer's own time format ("14:05", or "02:05 PM").
    const time = new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    expect(items(root)[1].text).toContain(`Try again at ${time}.`);
  });

  it("Continue (the arrow) is disabled until every requirement is met; pressing it then continues", () => {
    const unmet = offline({ internet: true, github: "unreachable" });
    expect(next(unmet.root).getAttribute("aria-disabled")).toBe("true");
    next(unmet.root).click();
    expect(unmet.actions.retry).not.toHaveBeenCalled();

    const met = offline({ internet: true, github: "ok" });
    expect(items(met.root).map((i) => i.state)).toEqual(["ok", "ok"]);
    expect(items(met.root)[1].text).toBe("Distribution servers are reachable");
    expect(next(met.root).getAttribute("aria-disabled")).toBe("false");
    next(met.root).click();
    expect(met.actions.retry).toHaveBeenCalledTimes(1);
  });
});

describe("renderMigrations — status and buttons", () => {
  const status = (root: HTMLElement) => root.querySelector<HTMLElement>(".mg-body .mg-status");

  it("the status is right below the text, coloured; not in the top bar; the bottom bar has only buttons", () => {
    for (const phase of ["checking", "running", "done", "failed", "error", "newer"] as const) {
      const r = setup({ phase, completed: 1, total: 3 }).root;
      expect(r.querySelector(".mg-titlebar .mg-status")).toBeNull();
      expect(r.querySelector(".mg-intro")?.nextElementSibling?.classList.contains("mg-status")).toBe(true);
    }
    const failed = setup({ phase: "failed", completed: 1, total: 3 }).root;
    expect(status(failed)?.textContent).toBe("Update failed");
    expect(status(failed)?.classList.contains("mg-status--bad")).toBe(true);
    expect(failed.querySelector(".mg-bottombar")!.textContent!.trim()).toBe("");
    const done = setup({ phase: "done", completed: 3, total: 3 }).root;
    expect(status(done)?.classList.contains("mg-status--ok")).toBe(true);
  });

  it("no bottom bar when there are no buttons", () => {
    const { root } = setup({ phase: "running", completed: 1, total: 3 });
    expect(root.querySelector(".mg-bottombar")).toBeNull();
    expect(status(root)?.textContent).toBe("1 of 3 done");
  });

  it("the buttons show the app's tooltip, not the native one", () => {
    const host = { show: vi.fn(), hide: vi.fn() };
    tooltipController._host = host;
    const { root } = setup({ phase: "offline", completed: 0, total: 0 });
    for (const [action, text] of [
      ["quit", "Quit"],
      ["retry", "Continue"],
    ]) {
      const button = root.querySelector<HTMLElement>(`[data-action="${action}"]`)!;
      expect(button.hasAttribute("title")).toBe(false);
      button.dispatchEvent(new MouseEvent("mouseenter"));
      expect(host.show).toHaveBeenLastCalledWith(button, { type: "simple", text });
    }
  });
});

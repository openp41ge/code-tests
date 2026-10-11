// @ts-nocheck
/**
 * Unit tests for the confirm window renderer (confirm.ts).
 *
 * The module runs top-level side effects (grabs `#root`, the preload bridge)
 * and registers the `onOptions` callback, so we set up the DOM and a fake
 * bridge *before* dynamically importing the module. We then dispatch options
 * and assert the rendered UI + the answer it reports.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

function makeBridge() {
  const handlers = new Map();
  const answers = [];
  const sizes = [];
  return {
    handlers,
    answers,
    sizes,
    onOptions(cb) {
      handlers.set("onOptions", cb);
    },
    respond(payload) {
      answers.push(payload);
    },
    fitSize(payload) {
      sizes.push(payload);
    },
  };
}

describe("confirm window renderer", () => {
  let bridge;

  beforeEach(async () => {
    vi.resetModules();
    document.body.innerHTML = '<div id="root"></div>';
    (window as any).openp41ge = { confirm: (bridge = makeBridge()) };
  });

  async function loadModule() {
    await import("../../../src/renderer/confirm.ts");
    return bridge.handlers.get("onOptions");
  }

  it("renders title, message, detail, and buttons when options arrive", async () => {
    const onOptions = await loadModule();
    onOptions(
      JSON.stringify({
        confirmId: "c1",
        options: { title: "Quit?", message: "Are you sure?", detail: "All panes close." },
      }),
    );
    const root = document.getElementById("root");
    expect(root.querySelector(".cf-title")?.textContent).toBe("Quit?");
    expect(root.querySelector(".cf-message")?.textContent).toBe("Are you sure?");
    expect(root.querySelector(".cf-detail")?.textContent).toBe("All panes close.");
    expect(root.querySelector(".cf-cancel")?.textContent).toBe("Cancel");
    expect(root.querySelector(".cf-ok")?.textContent).toBe("Confirm");
    expect(root.querySelector(".cf-checkbox-card")).toBeNull();
  });

  it("keeps the detail's line breaks (a list of items)", async () => {
    const onOptions = await loadModule();
    onOptions(
      JSON.stringify({
        confirmId: "c1",
        options: { message: "Delete?", detail: "One:\n• a\n• b" },
      }),
    );
    const detail = document.querySelector(".cf-detail");
    expect(getComputedStyle(detail).whiteSpace).toBe("pre-line");
  });

  it("reports confirmed=true when Confirm is pressed", async () => {
    const onOptions = await loadModule();
    onOptions(JSON.stringify({ confirmId: "c1", options: { message: "m" } }));
    document.querySelector(".cf-ok").click();
    expect(bridge.answers).toEqual([{ confirmId: "c1", confirmed: true, checked: false }]);
  });
  it("reports confirmed=false when Cancel is pressed or Escape is hit", async () => {
    const onOptions = await loadModule();
    onOptions(JSON.stringify({ confirmId: "c1", options: { message: "m" } }));
    document.querySelector(".cf-cancel").click();
    expect(bridge.answers).toEqual([{ confirmId: "c1", confirmed: false, checked: false }]);

    bridge.answers.length = 0;
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(bridge.answers).toEqual([{ confirmId: "c1", confirmed: false, checked: false }]);
  });

  it("renders a checkbox and includes checked state in the answer", async () => {
    const onOptions = await loadModule();
    onOptions(
      JSON.stringify({
        confirmId: "c1",
        options: { message: "m", checkboxLabel: "Also delete files", checkboxDetail: "Permanent" },
      }),
    );
    const cb = document.querySelector("#cf-checkbox");
    expect(cb).toBeTruthy();
    // Clicking the checkbox bubbles to the card's click handler, which
    // records the updated checked state.
    cb.click();
    expect(cb.checked).toBe(true);
    document.querySelector(".cf-ok").click();
    expect(bridge.answers).toEqual([{ confirmId: "c1", confirmed: true, checked: true }]);
  });

  it("applies danger styling when confirmStyle is danger", async () => {
    const onOptions = await loadModule();
    onOptions(
      JSON.stringify({
        confirmId: "c1",
        options: { message: "m", confirmStyle: "danger" },
      }),
    );
    const ok = document.querySelector(".cf-ok");
    expect(ok.classList.contains("cf-danger")).toBe(true);
  });

  it("reports the fitted size after rendering", async () => {
    const onOptions = await loadModule();
    onOptions(JSON.stringify({ confirmId: "c1", options: { message: "m" } }));
    await new Promise((r) => requestAnimationFrame(r));
    expect(bridge.sizes.length).toBe(1);
  });
});

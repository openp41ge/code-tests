/**
 * Tests for <openp41ge-config-editor> — the platform's JSON editor for one
 * extension's config (the `config-editor` grid tab). It edits the user's
 * values against the extension's registered schema; nothing is stored until
 * Save, which sends the whole document to main (validated there).
 */
import { describe, test, expect, beforeEach, vi } from "vitest";
import type { ConfigSchema } from "openp41ge-sdk";
import "@openp41ge/renderer/components/openp41ge-config-editor";
import type { Openp41geConfigEditor } from "@openp41ge/renderer/components/openp41ge-config-editor";
import type {
  ExtensionConfigBridge,
  ExtensionConfigChange,
} from "@openp41ge/renderer/services/extension-configs";

const SCHEMA: ConfigSchema = {
  type: "object",
  properties: {
    model: { type: "string", default: "qwen" },
    temperature: { type: "number", default: 0.7 },
  },
};

function fakeBridge(overrides: Record<string, unknown> = { model: "llama" }) {
  let stored = overrides;
  const listeners = new Set<(c: ExtensionConfigChange) => void>();
  const bridge: ExtensionConfigBridge = {
    registerSchema: vi.fn(async () => undefined),
    get: vi.fn(async () => ({})),
    describe: vi.fn(async (id: string) =>
      id === "demo"
        ? { schema: SCHEMA, defaults: { model: "qwen", temperature: 0.7 }, overrides: stored }
        : null,
    ),
    set: vi.fn(async (_id: string, next: Record<string, unknown>) => {
      stored = next;
    }),
    onChanged: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
  return {
    bridge,
    store: (next: Record<string, unknown>) => {
      stored = next;
      for (const fn of listeners) fn({ extensionId: "demo", config: next });
    },
    listeners,
  };
}

const tick = (ms = 10) => new Promise((r) => setTimeout(r, ms));

async function mount(bridge: ExtensionConfigBridge, extensionId = "demo") {
  const el = document.createElement("openp41ge-config-editor") as Openp41geConfigEditor;
  el.bridge = bridge;
  el.extensionId = extensionId;
  document.body.appendChild(el);
  await tick();
  return el;
}

const editor = (el: HTMLElement) =>
  el.querySelector(".cfe-editor > json-editor") as HTMLElement & {
    value: unknown;
    schema: unknown;
    defaults: unknown;
  };

function commit(el: HTMLElement, value: Record<string, unknown>) {
  editor(el).dispatchEvent(new CustomEvent("json-editor-change", { detail: { value } }));
}

const button = (el: HTMLElement, label: string) =>
  el.querySelector(`[aria-label="${label}"]`) as HTMLButtonElement;

describe("openp41ge-config-editor", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  test("edits the user's values with the extension's schema and defaults", async () => {
    const { bridge } = fakeBridge();
    const el = await mount(bridge);
    expect(bridge.describe).toHaveBeenCalledWith("demo");
    expect(editor(el).value).toEqual({ model: "llama" });
    expect(editor(el).schema).toBe(SCHEMA);
    expect(editor(el).defaults).toEqual({ model: "qwen", temperature: 0.7 });
  });

  test("stores nothing until Save, then sends the whole document", async () => {
    const { bridge } = fakeBridge();
    const el = await mount(bridge);
    commit(el, { model: "mistral", temperature: 1 });
    await tick();
    expect(bridge.set).not.toHaveBeenCalled();

    button(el, "Save settings").click();
    await tick();
    expect(bridge.set).toHaveBeenCalledWith("demo", { model: "mistral", temperature: 1 });
    expect(button(el, "Reset settings").disabled).toBe(true);
  });

  test("shows main's refusal and keeps the edit", async () => {
    const { bridge } = fakeBridge();
    bridge.set = vi.fn(async () => {
      throw new Error(
        "Error invoking remote method 'extension-config:set': Error: temperature: expected number",
      );
    });
    const el = await mount(bridge);
    commit(el, { temperature: "hot" });
    await tick();
    button(el, "Save settings").click();
    await tick();
    expect(el.querySelector(".cfe-note--error")?.textContent).toContain(
      "temperature: expected number",
    );
    expect(editor(el).value).toEqual({ temperature: "hot" });
    expect(button(el, "Reset settings").disabled).toBe(false);
  });

  test("Reset discards the staged edit", async () => {
    const { bridge } = fakeBridge();
    const el = await mount(bridge);
    commit(el, { model: "mistral" });
    await tick();
    button(el, "Reset settings").click();
    await tick();
    expect(editor(el).value).toEqual({ model: "llama" });
  });

  test("picks up a change made elsewhere while it has no unsaved edits", async () => {
    const { bridge, store } = fakeBridge();
    const el = await mount(bridge);
    store({ model: "phi" });
    await tick();
    expect(editor(el).value).toEqual({ model: "phi" });

    // With unsaved edits, the user's draft is kept.
    commit(el, { model: "mine" });
    await tick();
    store({ model: "theirs" });
    await tick();
    expect(editor(el).value).toEqual({ model: "mine" });
  });

  test("says so when the extension has no settings", async () => {
    const { bridge } = fakeBridge();
    const el = await mount(bridge, "other");
    expect(editor(el)).toBeNull();
    expect(el.textContent).toContain("has no settings");
  });

  test("stops listening for changes when removed", async () => {
    const { bridge, listeners } = fakeBridge();
    const el = await mount(bridge);
    expect(listeners.size).toBe(1);
    el.remove();
    expect(listeners.size).toBe(0);
  });
});

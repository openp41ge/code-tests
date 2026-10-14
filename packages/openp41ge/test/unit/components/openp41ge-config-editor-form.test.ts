/**
 * <openp41ge-config-editor> opens in a Form view of the extension's settings
 * (`<json-form>`), with a switch to the JSON view (as the workspace editor
 * has). Both edit the same staged values; Save stores them. The form shows
 * the schema's problems with the values (`configErrors`) under their fields.
 */
import { describe, test, expect, beforeEach, vi } from "vitest";
import type { ConfigSchema } from "openp41ge-sdk";
import "@openp41ge/renderer/components/openp41ge-config-editor";
import type { Openp41geConfigEditor } from "@openp41ge/renderer/components/openp41ge-config-editor";
import type { ExtensionConfigBridge } from "@openp41ge/renderer/services/extension-configs";

const SCHEMA: ConfigSchema = {
  type: "object",
  properties: {
    model: { type: "string", default: "qwen" },
    temperature: { type: "number", minimum: 0, maximum: 2, default: 0.7 },
  },
};

function fakeBridge(overrides: Record<string, unknown> = { model: "llama" }) {
  const bridge: ExtensionConfigBridge = {
    registerSchema: vi.fn(async () => undefined),
    get: vi.fn(async () => ({})),
    describe: vi.fn(async () => ({
      schema: SCHEMA,
      defaults: { model: "qwen", temperature: 0.7 },
      overrides,
    })),
    set: vi.fn(async () => undefined),
    onChanged: () => () => undefined,
  };
  return bridge;
}

const tick = (ms = 10) => new Promise((r) => setTimeout(r, ms));

async function mount(bridge: ExtensionConfigBridge) {
  const el = document.createElement("openp41ge-config-editor") as Openp41geConfigEditor;
  el.bridge = bridge;
  el.extensionId = "demo";
  document.body.appendChild(el);
  await tick();
  return el;
}

type Form = HTMLElement & { schema: unknown; value: unknown; defaults: unknown; errors: unknown };
const form = (el: HTMLElement) => el.querySelector(".cfe-editor > json-form") as Form | null;
const jsonEditor = (el: HTMLElement) => el.querySelector(".cfe-editor > json-editor");
const button = (el: HTMLElement, label: string) =>
  el.querySelector(`[aria-label="${label}"]`) as HTMLButtonElement | null;

describe("openp41ge-config-editor form view", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  test("opens in the form view, with the schema, the user's values and the defaults", async () => {
    const el = await mount(fakeBridge());
    expect(jsonEditor(el)).toBeNull();
    expect(form(el)!.schema).toBe(SCHEMA);
    expect(form(el)!.value).toEqual({ model: "llama" });
    expect(form(el)!.defaults).toEqual({ model: "qwen", temperature: 0.7 });
  });

  test("a form edit is staged; Save stores it", async () => {
    const bridge = fakeBridge();
    const el = await mount(bridge);
    form(el)!.dispatchEvent(
      new CustomEvent("json-form-change", {
        detail: { value: { model: "llama", temperature: 1 } },
      }),
    );
    await tick();
    expect(button(el, "Save settings")!.classList.contains("cfe-btn--dirty")).toBe(true);
    button(el, "Save settings")!.click();
    await tick();
    expect(bridge.set).toHaveBeenCalledWith("demo", { model: "llama", temperature: 1 });
  });

  test("shows the schema's problems with the values under their fields", async () => {
    const el = await mount(fakeBridge({ temperature: 5 }));
    expect(form(el)!.errors).toEqual([
      { path: "temperature", message: "temperature: must be at most 2" },
    ]);
  });

  test("switches to the JSON view and back, keeping the staged values", async () => {
    const el = await mount(fakeBridge());
    form(el)!.dispatchEvent(
      new CustomEvent("json-form-change", { detail: { value: { model: "mistral" } } }),
    );
    await tick();
    button(el, "Edit as JSON")!.click();
    await tick();
    expect(form(el)).toBeNull();
    expect((jsonEditor(el) as HTMLElement & { value: unknown }).value).toEqual({
      model: "mistral",
    });
    button(el, "Edit as form")!.click();
    await tick();
    expect(form(el)!.value).toEqual({ model: "mistral" });
  });

  test("the JSON view's own buttons are only in the JSON view", async () => {
    const el = await mount(fakeBridge());
    expect(button(el, "Show default values")).toBeNull();
    expect(button(el, "Sort keys")).toBeNull();
    button(el, "Edit as JSON")!.click();
    await tick();
    expect(button(el, "Show default values")).not.toBeNull();
    expect(button(el, "Sort keys")).not.toBeNull();
  });
});

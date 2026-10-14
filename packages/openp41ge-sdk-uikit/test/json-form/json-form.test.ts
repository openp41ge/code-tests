// @ts-nocheck
/**
 * <json-form> renders a config schema as a form: a labelled field per
 * property; an unset field shows its default, faded; Reset removes the
 * user's value. Each edit emits `json-form-change` with the full user values
 * (the host validates and saves). Lists edit item by item; lists of objects
 * are cards (accordion segments) with add, remove and reorder.
 */
import { describe, it, expect, afterEach } from "vitest";
import "../../src/json-form/json-form";
import { JSON_FORM_CHANGE } from "../../src/json-form/json-form";

const schema = {
  type: "object",
  required: ["apiKey"],
  properties: {
    enabled: { type: "boolean", title: "Enabled", default: true },
    size: { type: "integer", title: "Size", minimum: 1, maximum: 9, default: 3 },
    mode: { enum: ["fast", "safe"], title: "Mode", default: "safe" },
    name: { type: "string", title: "Name", description: "Shown **bold**" },
    apiKey: { type: "string", title: "API key", secret: true },
    tags: { type: "array", title: "Tags", items: { type: "string" } },
    hosts: {
      type: "array",
      title: "Hosts",
      items: {
        type: "object",
        properties: { url: { type: "string", title: "URL" }, port: { type: "integer" } },
      },
    },
    nested: { type: "object", title: "Nested", properties: { depth: { type: "integer" } } },
    map: { type: "object", title: "Map", additionalProperties: { type: "string" } },
  },
};
const defaults = { enabled: true, size: 3, mode: "safe" };

async function mount(props: Record<string, unknown> = {}) {
  const el = document.createElement("json-form");
  Object.assign(el, { schema, value: {}, defaults, ...props });
  const changes: unknown[] = [];
  document.body.addEventListener(JSON_FORM_CHANGE, (e) => changes.push(e.detail.value));
  document.body.appendChild(el);
  await el.updateComplete;
  return { el, root: el.shadowRoot, changes };
}

/** The field for `key` (its wrapper carries data-key). */
const fieldOf = (root, key) => root.querySelector(`[data-key="${key}"]`);
const control = (root, key) => fieldOf(root, key).querySelector("input, select, openp41ge-toggle");

async function typeInto(el, input, text) {
  input.value = text;
  input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
  await el.updateComplete;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("json-form fields", () => {
  it("renders a labelled field per property, the label naming its input", async () => {
    const { root } = await mount();
    const input = control(root, "size");
    const label = root.querySelector(`label[for="${input.id}"]`);
    expect(label.textContent).toContain("Size");
    expect(fieldOf(root, "name").querySelector(".jf-description").innerHTML).toContain(
      "<strong>bold</strong>",
    );
  });

  it("a description's headings and code blocks stay description-sized", async () => {
    const { el } = await mount();
    const css = el.constructor.elementStyles.map((s) => s.cssText).join("\n");
    expect(css).toMatch(/\.jf-description :is\(h1, h2, h3, h4, h5, h6\)\s*\{[^}]*font-size: 12px/);
    expect(css).toMatch(/\.jf-description pre\s*\{[^}]*font-size: 11px/);
  });

  it("required settings without a default come first, marked Required", async () => {
    const { root } = await mount();
    const first = root.querySelector("[data-key]");
    expect(first.dataset.key).toBe("apiKey");
    expect(first.textContent).toContain("Required");
  });

  it("an unset field shows its default, faded; a setting with no default says Not set", async () => {
    const { root } = await mount();
    expect(control(root, "size").value).toBe("3");
    expect(fieldOf(root, "size").classList.contains("jf-default")).toBe(true);
    expect(control(root, "name").placeholder).toBe("Not set");
  });

  it("a set field shows the user's value with Reset; Reset removes it", async () => {
    const { el, root, changes } = await mount({ value: { size: 5, name: "x" } });
    expect(control(root, "size").value).toBe("5");
    expect(fieldOf(root, "size").classList.contains("jf-default")).toBe(false);
    const reset = fieldOf(root, "size").querySelector('button[aria-label="Reset Size"]');
    reset.click();
    await el.updateComplete;
    expect(changes.at(-1)).toEqual({ name: "x" });
  });

  it("boolean: a toggle", async () => {
    const { el, root, changes } = await mount();
    const toggle = control(root, "enabled");
    expect(toggle.tagName.toLowerCase()).toBe("openp41ge-toggle");
    toggle.dispatchEvent(new CustomEvent("change", { detail: { checked: false } }));
    await el.updateComplete;
    expect(changes.at(-1)).toEqual({ enabled: false });
  });

  it("number: bounds and integer step; typing sets it, clearing resets it", async () => {
    const { el, root, changes } = await mount({ value: { size: 5 } });
    const input = control(root, "size");
    expect([input.type, input.min, input.max, input.step]).toEqual(["number", "1", "9", "1"]);
    await typeInto(el, input, "7");
    expect(changes.at(-1)).toEqual({ size: 7 });
    await typeInto(el, input, "");
    expect(changes.at(-1)).toEqual({});
  });

  it("enum: a menu of its values", async () => {
    const { el, root, changes } = await mount();
    const select = control(root, "mode");
    expect([...select.options].map((o) => o.textContent.trim())).toEqual(["fast", "safe"]);
    select.value = "0";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    await el.updateComplete;
    expect(changes.at(-1)).toEqual({ mode: "fast" });
  });

  it("string: a text input; a secret is masked", async () => {
    const { el, root, changes } = await mount();
    expect(control(root, "name").type).toBe("text");
    expect(control(root, "apiKey").type).toBe("password");
    await typeInto(el, control(root, "name"), "Ada");
    expect(changes.at(-1)).toEqual({ name: "Ada" });
  });

  it("an object is a group (fieldset/legend) of its fields", async () => {
    const { el, root, changes } = await mount();
    const group = fieldOf(root, "nested");
    expect(group.tagName.toLowerCase()).toBe("fieldset");
    expect(group.querySelector("legend").textContent).toContain("Nested");
    await typeInto(el, control(root, "nested.depth"), "4");
    expect(changes.at(-1)).toEqual({ nested: { depth: 4 } });
  });

  it("a shape it cannot edit points to the JSON view, showing its value", async () => {
    const { root } = await mount({ value: { map: { a: "b" } } });
    const field = fieldOf(root, "map");
    expect(field.textContent).toContain("Edit this in the JSON view");
    expect(field.querySelector(".jf-json").textContent).toContain('"a": "b"');
  });

  it("shows an error under its field", async () => {
    const { root } = await mount({
      value: { size: 0 },
      errors: [{ path: "size", message: "size: must be at least 1" }],
    });
    expect(fieldOf(root, "size").querySelector(".jf-error").textContent).toContain(
      "must be at least 1",
    );
    expect(control(root, "size").value).toBe("0");
  });

  it("readonly: nothing can be edited", async () => {
    const { root } = await mount({ readonly: true, value: { size: 5, tags: ["a"] } });
    for (const input of root.querySelectorAll("input, select")) expect(input.disabled).toBe(true);
    expect(control(root, "enabled").disabled).toBe(true);
    expect(root.querySelector('button:not([disabled])')).toBeNull();
  });

  it("emits a bubbling, composed json-form-change", async () => {
    const { el, root } = await mount();
    let event;
    document.addEventListener(JSON_FORM_CHANGE, (e) => (event = e), { once: true });
    await typeInto(el, control(root, "name"), "x");
    expect(event.bubbles).toBe(true);
    expect(event.composed).toBe(true);
  });
});

describe("json-form lists", () => {
  it("a list of values: edit, add and remove items", async () => {
    const { el, root, changes } = await mount({ value: { tags: ["a", "b"] } });
    const items = () => fieldOf(root, "tags").querySelectorAll(".jf-list-item input");
    expect([...items()].map((i) => i.value)).toEqual(["a", "b"]);
    await typeInto(el, items()[1], "c");
    expect(changes.at(-1)).toEqual({ tags: ["a", "c"] });
    fieldOf(root, "tags").querySelector('button[aria-label="Add to Tags"]').click();
    await el.updateComplete;
    expect(changes.at(-1)).toEqual({ tags: ["a", "c", ""] });
    fieldOf(root, "tags").querySelector('button[aria-label="Remove item 1 of Tags"]').click();
    await el.updateComplete;
    expect(changes.at(-1)).toEqual({ tags: ["c", ""] });
  });

  it("a list of objects: a card of segments, one per item, titled by its first text", async () => {
    const { root } = await mount({ value: { hosts: [{ url: "a.example" }, { url: "b.example" }] } });
    const segs = fieldOf(root, "hosts").querySelectorAll(".jf-card > .jf-seg");
    expect([...segs].map((s) => s.querySelector(".jf-seg-title").textContent.trim())).toEqual([
      "a.example",
      "b.example",
    ]);
  });

  it("opening an item shows its fields; editing one sets the list", async () => {
    const { el, root, changes } = await mount({ value: { hosts: [{ url: "a.example" }] } });
    fieldOf(root, "hosts").querySelector(".jf-seg-head").click();
    await el.updateComplete;
    await typeInto(el, control(root, "hosts[0].port"), "8080");
    expect(changes.at(-1)).toEqual({ hosts: [{ url: "a.example", port: 8080 }] });
  });

  it("add, remove and reorder items", async () => {
    const { el, root, changes } = await mount({
      value: { hosts: [{ url: "a" }, { url: "b" }] },
    });
    const hosts = () => fieldOf(root, "hosts");
    hosts().querySelector('button[aria-label="Move item 1 of Hosts down"]').click();
    await el.updateComplete;
    expect(changes.at(-1)).toEqual({ hosts: [{ url: "b" }, { url: "a" }] });
    hosts().querySelector('button[aria-label="Add to Hosts"]').click();
    await el.updateComplete;
    expect(changes.at(-1)).toEqual({ hosts: [{ url: "b" }, { url: "a" }, {}] });
    hosts().querySelector('button[aria-label="Remove item 1 of Hosts"]').click();
    await el.updateComplete;
    expect(changes.at(-1)).toEqual({ hosts: [{ url: "a" }, {}] });
  });
});

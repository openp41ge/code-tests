// @ts-nocheck
/**
 * <json-form> renders a config schema as a form: a labelled field per
 * property; an unset field shows its default, faded; a setting with a
 * default always has a Reset icon (greyed out while unset), which removes the
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
    either: { type: ["string", "number"], title: "Either" },
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

  it("a text input is a full-width card: a background, no outline", async () => {
    const { el } = await mount();
    const css = el.constructor.elementStyles.map((s) => s.cssText).join("\n");
    const rule = css.match(/\.jf-input\s*\{([^}]*)\}/)![1];
    expect(rule).toMatch(/width: 100%/);
    expect(rule).not.toMatch(/max-width/);
    expect(rule).toMatch(/border: none/);
    expect(rule).toMatch(/background: var\(--jf-input-bg, var\(--bg-tertiary/);
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
    expect(reset.disabled).toBe(false);
    reset.click();
    await el.updateComplete;
    expect(changes.at(-1)).toEqual({ name: "x" });
  });

  it("every setting with a default has a Reset icon right of its control, greyed out while unset", async () => {
    const { root } = await mount();
    for (const [key, label] of [
      ["enabled", "Enabled"],
      ["size", "Size"],
      ["mode", "Mode"],
    ]) {
      const reset = fieldOf(root, key).querySelector(`button[aria-label="Reset ${label}"]`);
      expect(reset.disabled).toBe(true);
      expect(reset.classList.contains("jf-icon-btn")).toBe(true);
      expect(reset.querySelector("svg")).not.toBeNull();
      // On the control's row, after it.
      const row = reset.parentElement;
      expect(row.classList.contains("jf-row")).toBe(true);
      expect(row.firstElementChild).toBe(control(root, key));
    }
  });

  it("a setting with no default has Reset only once it is set", async () => {
    const { el, root } = await mount();
    expect(fieldOf(root, "name").querySelector('button[aria-label="Reset Name"]')).toBeNull();
    el.value = { name: "x" };
    await el.updateComplete;
    expect(fieldOf(root, "name").querySelector('button[aria-label="Reset Name"]').disabled).toBe(
      false,
    );
  });

  it("read only: no Reset", async () => {
    const { root } = await mount({ readonly: true, value: { size: 5 } });
    expect(root.querySelector('button[aria-label^="Reset"]')).toBeNull();
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
    const { root } = await mount({ value: { either: "b" } });
    const field = fieldOf(root, "either");
    expect(field.textContent).toContain("Edit this in the JSON view");
    expect(field.querySelector(".jf-json").textContent).toContain('"b"');
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
    expect(root.querySelector("button:not([disabled])")).toBeNull();
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
    const { root } = await mount({
      value: { hosts: [{ url: "a.example" }, { url: "b.example" }] },
    });
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

describe("json-form maps", () => {
  const mapSchema = {
    type: "object",
    properties: {
      defaultHost: { type: "string", title: "Default host", "x-keysOf": "hosts", default: "a" },
      hosts: {
        type: "object",
        title: "Hosts",
        default: { a: { url: "a.example" } },
        additionalProperties: {
          type: "object",
          properties: { url: { type: "string", title: "URL" } },
        },
      },
      levels: {
        type: "object",
        title: "Levels",
        additionalProperties: { type: ["string", "null"] },
      },
    },
  };
  const mapDefaults = { defaultHost: "a", hosts: { a: { url: "a.example" } } };
  const mountMap = (value = {}) => mount({ schema: mapSchema, defaults: mapDefaults, value });

  it("a map with a default has Reset in its head, greyed out until the user changes it", async () => {
    const { el, root, changes } = await mountMap();
    const reset = () => fieldOf(root, "hosts").querySelector('button[aria-label="Reset Hosts"]');
    expect(reset().disabled).toBe(true);
    expect(reset().parentElement.classList.contains("jf-head")).toBe(true);
    el.value = { hosts: { b: { url: "b.example" } } };
    await el.updateComplete;
    reset().click();
    await el.updateComplete;
    expect(changes.at(-1)).toEqual({});
  });
  const segs = (root) => [...fieldOf(root, "hosts").querySelectorAll(".jf-card > .jf-seg")];
  const btn = (root, label) => root.querySelector(`button[aria-label="${label}"]`);

  it("a map of objects: a card of segments titled by key; the x-keysOf one is Default", async () => {
    const { root } = await mountMap({ hosts: { b: { url: "b.example" } } });
    expect(segs(root).map((s) => s.querySelector(".jf-seg-title").textContent.trim())).toEqual([
      "a",
      "b",
    ]);
    expect(segs(root)[0].querySelector(".jf-pill").textContent).toContain("Default");
    expect(segs(root)[1].querySelector(".jf-pill")).toBeNull();
  });

  it("x-keysOf: the setting is a menu of the map's keys; Make default sets it", async () => {
    const { el, root, changes } = await mountMap({ hosts: { b: {} } });
    const select = control(root, "defaultHost");
    expect([...select.options].map((o) => o.textContent.trim())).toEqual(["a", "b"]);
    btn(root, "Make b the default host").click();
    await el.updateComplete;
    expect(changes.at(-1)).toEqual({ hosts: { b: {} }, defaultHost: "b" });
  });

  it("opening an entry shows its fields; editing one sets it", async () => {
    const { el, root, changes } = await mountMap();
    segs(root)[0].querySelector(".jf-seg-head").click();
    await el.updateComplete;
    await typeInto(el, control(root, "hosts.a.url"), "x.example");
    expect(changes.at(-1)).toEqual({ hosts: { a: { url: "x.example" } } });
  });

  it("adds an entry under a new key; an empty or taken key cannot be added", async () => {
    const { el, root, changes } = await mountMap();
    const key = fieldOf(root, "hosts").querySelector('input[aria-label="New key for Hosts"]');
    const add = btn(root, "Add to Hosts");
    expect(add.disabled).toBe(true);
    await typeInto(el, key, "a");
    expect(add.disabled).toBe(true);
    await typeInto(el, key, "c");
    add.click();
    await el.updateComplete;
    expect(changes.at(-1)).toEqual({ hosts: { c: {} } });
    expect(segs(root)[1].classList.contains("jf-seg--open")).toBe(true);
  });

  it("renames and removes the user's entries; the default follows a rename", async () => {
    const { el, root, changes } = await mountMap({ defaultHost: "b", hosts: { b: { url: "b" } } });
    segs(root)[1].querySelector(".jf-seg-head").click();
    await el.updateComplete;
    const key = segs(root)[1].querySelector('input[aria-label="Key of b"]');
    key.value = "d";
    key.dispatchEvent(new Event("change", { bubbles: true }));
    await el.updateComplete;
    expect(changes.at(-1)).toEqual({ defaultHost: "d", hosts: { d: { url: "b" } } });
    btn(root, "Remove d from Hosts").click();
    await el.updateComplete;
    expect(changes.at(-1)).toEqual({ defaultHost: "d" });
  });

  it("an entry from the defaults cannot be removed or renamed", async () => {
    const { el, root } = await mountMap();
    expect(btn(root, "Remove a from Hosts").disabled).toBe(true);
    segs(root)[0].querySelector(".jf-seg-head").click();
    await el.updateComplete;
    expect(segs(root)[0].querySelector('input[aria-label="Key of a"]').disabled).toBe(true);
  });

  it("a map of values: one row per key; clearing a nullable value sets null", async () => {
    const { el, root, changes } = await mountMap({ levels: { Low: "low" } });
    const input = control(root, "levels.Low");
    expect(input.value).toBe("low");
    await typeInto(el, input, "");
    expect(changes.at(-1)).toEqual({ levels: { Low: null } });
  });
});

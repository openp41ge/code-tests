// @ts-nocheck
/**
 * <json-form> renders a config schema as a form: a labelled field per
 * property; an unset field shows its default, faded; a setting with a
 * default always has a Reset icon (greyed out while unset), which removes the
 * user's value. Each edit emits `json-form-change` with the full user values
 * (the host validates and saves). Every object and array is a card that
 * opens a drawer from the right with it as a form; drawers stack.
 */
import { describe, it, expect, afterEach } from "vitest";
import "../../src/json-form/json-form";
import { JSON_FORM_CHANGE } from "../../src/json-form/json-form";
import { focusLineLayer } from "../../src/components/tabs/focus-line";

const schema = {
  type: "object",
  required: ["apiKey"],
  properties: {
    enabled: { type: "boolean", title: "Enabled", default: true },
    size: { type: "integer", title: "Size", minimum: 1, maximum: 9, default: 3 },
    mode: { enum: ["fast", "safe"], title: "Mode", default: "safe" },
    ratio: { type: "number", title: "Ratio" },
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
const control = (root, key) =>
  fieldOf(root, key).querySelector("input, openp41ge-select, openp41ge-toggle");

/** The card of an object or array setting, and the drawer it opens. */
const card = (root, key) => root.querySelector(`.jf-sub[data-key="${key}"]`);
const drawer = (root, key) => root.querySelector(`.jf-drawer[data-drawer="${key}"]`);
async function open(el, root, key) {
  card(root, key).click();
  await el.updateComplete;
  return drawer(root, key);
}

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

  it("an input's Reset is inside its card; a toggle's sits at the row's right", async () => {
    const { el, root } = await mount();
    const rowOf = (key) => control(root, key).parentElement;
    expect(rowOf("size").classList.contains("jf-input-card")).toBe(true);
    expect(rowOf("mode").classList.contains("jf-input-card")).toBe(true);
    expect(rowOf("enabled").classList.contains("jf-input-card")).toBe(false);
    const css = el.constructor.elementStyles.map((s) => s.cssText).join("\n");
    // The card carries the input's background; the input inside it has none.
    expect(css).toMatch(/\.jf-input-card\s*\{[^}]*background: var\(--jf-input-bg/);
    expect(css).toMatch(/\.jf-input-card > \.jf-input[^{]*\{[^}]*background: transparent/);
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

  it("number: a text field (not a number field); typing a number sets it, clearing resets it", async () => {
    const { el, root, changes } = await mount({ value: { size: 5 } });
    const input = control(root, "size");
    expect(input.type).toBe("text");
    expect(input.inputMode).toBe("numeric");
    await typeInto(el, input, "7");
    expect(changes.at(-1)).toEqual({ size: 7 });
    await typeInto(el, input, "");
    expect(changes.at(-1)).toEqual({});
  });

  it("number: text that is not a whole number stays, marked, and is not stored", async () => {
    const { el, root, changes } = await mount({ value: { size: 5 } });
    await typeInto(el, control(root, "size"), "7a");
    expect(changes).toEqual([]);
    expect(control(root, "size").value).toBe("7a");
    expect(control(root, "size").getAttribute("aria-invalid")).toBe("true");
    expect(fieldOf(root, "size").querySelector(".jf-error").textContent).toContain(
      "Enter a whole number",
    );
    await typeInto(el, control(root, "size"), "1.5");
    expect(changes).toEqual([]);
    await typeInto(el, control(root, "size"), "8");
    expect(changes.at(-1)).toEqual({ size: 8 });
    expect(control(root, "size").getAttribute("aria-invalid")).toBe("false");
    expect(fieldOf(root, "size").querySelector(".jf-error")).toBeNull();
  });

  it("number (not integer): decimals and negatives are numbers; other text is not", async () => {
    const { el, root, changes } = await mount();
    const input = () => control(root, "ratio");
    expect(input().type).toBe("text");
    expect(input().inputMode).toBe("decimal");
    await typeInto(el, input(), "-1.5");
    expect(changes.at(-1)).toEqual({ ratio: -1.5 });
    await typeInto(el, input(), "1.5.2");
    expect(changes.at(-1)).toEqual({ ratio: -1.5 });
    expect(fieldOf(root, "ratio").querySelector(".jf-error").textContent).toContain(
      "Enter a number",
    );
  });

  it("number: the field keeps the text as typed while in it (1. stays 1. on the way to 1.5)", async () => {
    const { el, root, changes } = await mount();
    await typeInto(el, control(root, "ratio"), "1.");
    expect(changes.at(-1)).toEqual({ ratio: 1 });
    expect(control(root, "ratio").value).toBe("1.");
    await typeInto(el, control(root, "ratio"), "1.5");
    expect(changes.at(-1)).toEqual({ ratio: 1.5 });
    // Leaving it shows the stored number.
    await typeInto(el, control(root, "ratio"), "01.50");
    control(root, "ratio").dispatchEvent(new Event("blur"));
    await el.updateComplete;
    expect(control(root, "ratio").value).toBe("1.5");
  });

  it("Reset clears text that was not a number", async () => {
    const { el, root } = await mount({ value: { size: 5 } });
    await typeInto(el, control(root, "size"), "x");
    fieldOf(root, "size").querySelector('button[aria-label="Reset Size"]').click();
    await el.updateComplete;
    expect(control(root, "size").value).toBe("3");
    expect(fieldOf(root, "size").querySelector(".jf-error")).toBeNull();
  });

  it("enum: a menu of its values (the toolkit's dropdown, not the native one)", async () => {
    const { el, root, changes } = await mount();
    const select = control(root, "mode");
    expect(select.tagName.toLowerCase()).toBe("openp41ge-select");
    // Its list is as wide as the card it sits in (with Reset).
    expect(select.alignTo).toBe(".jf-input-card");
    expect(select.options.map((o) => o.label)).toEqual(["fast", "safe"]);
    select.dispatchEvent(new CustomEvent("change", { detail: { value: "0" } }));
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

  it("an object is a card; clicking it opens a drawer with its fields", async () => {
    const { el, root, changes } = await mount();
    expect(root.querySelector("fieldset")).toBeNull();
    expect(card(root, "nested").querySelector(".jf-sub-title").textContent).toContain("Nested");
    expect(fieldOf(root, "nested.depth")).toBeNull();
    const d = await open(el, root, "nested");
    expect(d.getAttribute("role")).toBe("dialog");
    expect(d.querySelector(".jf-drawer-title").textContent).toContain("Nested");
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

  it("readonly: nothing can be edited (drawers still open, to look)", async () => {
    const { el, root } = await mount({ readonly: true, value: { size: 5, tags: ["a"] } });
    await open(el, root, "tags");
    for (const input of root.querySelectorAll("input, openp41ge-select"))
      expect(input.disabled).toBe(true);
    expect(control(root, "enabled").disabled).toBe(true);
    // Closing a drawer and switching its view are for looking: still on.
    expect(
      root.querySelector("button:not([disabled]):not(.jf-drawer-close):not(.jf-foot-btn)"),
    ).toBeNull();
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
  it("a list of values: a card; its drawer edits and removes items", async () => {
    const { el, root, changes } = await mount({ value: { tags: ["a", "b"] } });
    const d = await open(el, root, "tags");
    const items = () => d.querySelectorAll(".jf-list-item:not(.jf-new) input");
    expect([...items()].map((i) => i.value)).toEqual(["a", "b"]);
    await typeInto(el, items()[1], "c");
    expect(changes.at(-1)).toEqual({ tags: ["a", "c"] });
    d.querySelector('button[aria-label="Remove item 1 of Tags"]').click();
    await el.updateComplete;
    expect(changes.at(-1)).toEqual({ tags: ["c"] });
  });

  it("no Add buttons: an empty row is always last", async () => {
    const { el, root } = await mount({ value: { tags: ["a"], hosts: [{ url: "x" }] } });
    for (const key of ["tags", "hosts"]) {
      const d = await open(el, root, key);
      expect(d.querySelector(".jf-add")).toBeNull();
      expect(d.querySelector('[aria-label^="Add to"]')).toBeNull();
      expect(d.querySelectorAll(".jf-new").length).toBe(1);
      root.querySelector(".jf-mask").click();
      await el.updateComplete;
    }
  });

  it("typing in the empty row adds an item, keeps typing in it, and a new empty row follows", async () => {
    const { el, root, changes } = await mount({ value: { tags: ["a"] } });
    const d = await open(el, root, "tags");
    const fresh = () => d.querySelector('.jf-new input[aria-label="New item of Tags"]');
    expect(fresh().value).toBe("");
    fresh().focus();
    await typeInto(el, fresh(), "b");
    expect(changes.at(-1)).toEqual({ tags: ["a", "b"] });
    const items = [...d.querySelectorAll(".jf-list-item:not(.jf-new) input")];
    expect(items.map((i) => i.value)).toEqual(["a", "b"]);
    expect(root.activeElement).toBe(items[1]);
    expect(fresh().value).toBe("");
  });

  it("a list of numbers: typing a number in the empty row adds it", async () => {
    const { el, root, changes } = await mount({
      schema: {
        type: "object",
        properties: { ports: { type: "array", title: "Ports", items: { type: "integer" } } },
      },
      defaults: {},
    });
    const d = await open(el, root, "ports");
    const fresh = () => d.querySelector('.jf-new input[aria-label="New item of Ports"]');
    expect(fresh().type).toBe("text");
    await typeInto(el, fresh(), "x");
    expect(changes).toEqual([]);
    expect(fresh().getAttribute("aria-invalid")).toBe("true");
    await typeInto(el, fresh(), "80");
    expect(changes.at(-1)).toEqual({ ports: [80] });
    const item = d.querySelector(".jf-list-item:not(.jf-new) input");
    expect(item.type).toBe("text");
    await typeInto(el, item, "8o");
    expect(changes.at(-1)).toEqual({ ports: [80] });
    expect(item.getAttribute("aria-invalid")).toBe("true");
  });

  it("a list of choices: picking from the empty row's menu adds it", async () => {
    const { el, root, changes } = await mount({
      schema: {
        type: "object",
        properties: {
          levels: { type: "array", title: "Levels", items: { enum: ["low", "high"] } },
        },
      },
      defaults: {},
    });
    const d = await open(el, root, "levels");
    d.querySelector(".jf-new openp41ge-select").dispatchEvent(
      new CustomEvent("change", { detail: { value: "1" } }),
    );
    await el.updateComplete;
    expect(changes.at(-1)).toEqual({ levels: ["high"] });
  });

  it("a list of objects: its drawer has a card per item, titled by its first text", async () => {
    const { el, root } = await mount({
      value: { hosts: [{ url: "a.example" }, { url: "b.example" }] },
    });
    const d = await open(el, root, "hosts");
    const cards = [...d.querySelectorAll(".jf-sub:not(.jf-new)")];
    expect(cards.map((c) => c.querySelector(".jf-sub-title").textContent.trim())).toEqual([
      "a.example",
      "b.example",
    ]);
  });

  it("an item's card opens its own drawer; editing a field sets the list", async () => {
    const { el, root, changes } = await mount({ value: { hosts: [{ url: "a.example" }] } });
    await open(el, root, "hosts");
    await open(el, root, "hosts[0]");
    await typeInto(el, control(root, "hosts[0].port"), "8080");
    expect(changes.at(-1)).toEqual({ hosts: [{ url: "a.example", port: 8080 }] });
  });

  it("remove and reorder items", async () => {
    const { el, root, changes } = await mount({
      value: { hosts: [{ url: "a" }, { url: "b" }] },
    });
    const d = await open(el, root, "hosts");
    d.querySelector('button[aria-label="Move item 1 of Hosts down"]').click();
    await el.updateComplete;
    expect(changes.at(-1)).toEqual({ hosts: [{ url: "b" }, { url: "a" }] });
    d.querySelector('button[aria-label="Remove item 1 of Hosts"]').click();
    await el.updateComplete;
    expect(changes.at(-1)).toEqual({ hosts: [{ url: "a" }] });
  });

  it("the empty card opens a drawer for a new item; what is entered there adds it", async () => {
    const { el, root, changes } = await mount({ value: { hosts: [{ url: "a" }] } });
    const d = await open(el, root, "hosts");
    d.querySelector('.jf-new[aria-label="New item of Hosts"]').click();
    await el.updateComplete;
    expect(drawer(root, "hosts[1]")).not.toBeNull();
    await typeInto(el, control(root, "hosts[1].url"), "b");
    expect(changes.at(-1)).toEqual({ hosts: [{ url: "a" }, { url: "b" }] });
    // A new empty card follows.
    expect(drawer(root, "hosts").querySelectorAll(".jf-new").length).toBe(1);
  });

  it("a new item left empty is gone when its drawer closes", async () => {
    const { el, root, changes } = await mount({ value: { hosts: [{ url: "a" }] } });
    const d = await open(el, root, "hosts");
    d.querySelector('.jf-new[aria-label="New item of Hosts"]').click();
    await el.updateComplete;
    drawer(root, "hosts[1]").querySelector(".jf-drawer-close").click();
    await el.updateComplete;
    await el.updateComplete;
    expect(changes.at(-1) ?? { hosts: [{ url: "a" }] }).toEqual({ hosts: [{ url: "a" }] });
    expect(drawer(root, "hosts").querySelectorAll(".jf-sub:not(.jf-new)").length).toBe(1);
  });
});

describe("json-form cards", () => {
  it("a card shows metadata about its value, not its properties", async () => {
    const { root } = await mount({ value: { tags: ["a", "b", "c"], hosts: [{ url: "x" }] } });
    const meta = (key) =>
      card(root, key).querySelector(".jf-meta").textContent.replace(/\s+/g, " ");
    expect(meta("tags")).toContain("3 strings");
    expect(meta("hosts")).toContain("1 object");
    expect(meta("nested")).toContain("1 property");
    expect(meta("nested")).toContain("0 set");
  });

  it("a card counts what is set and default inside it, and its errors", async () => {
    const { root } = await mount({
      schema: {
        type: "object",
        properties: {
          box: {
            type: "object",
            title: "Box",
            properties: {
              w: { type: "integer", default: 1 },
              h: { type: "integer", default: 2 },
              d: { type: "integer" },
            },
          },
        },
      },
      defaults: { box: { w: 1, h: 2 } },
      value: { box: { w: 5, d: 0 } },
      errors: [{ path: "box.d", message: "box.d: must be at least 1" }],
    });
    const meta = card(root, "box").querySelector(".jf-meta").textContent.replace(/\s+/g, " ");
    expect(meta).toContain("3 properties");
    expect(meta).toContain("2 set");
    expect(meta).toContain("1 default");
    expect(card(root, "box").querySelector(".jf-meta-error").textContent).toContain("1 error");
  });

  it("a card opens with Enter too", async () => {
    const { el, root } = await mount();
    card(root, "nested").dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
    await el.updateComplete;
    expect(drawer(root, "nested")).not.toBeNull();
  });
});

describe("json-form drawers", () => {
  const deep = {
    type: "object",
    properties: {
      a: {
        type: "object",
        title: "A",
        properties: {
          b: {
            type: "object",
            title: "B",
            properties: {
              c: { type: "object", title: "C", properties: { x: { type: "string" } } },
            },
          },
        },
      },
    },
  };
  const mountDeep = () => mount({ schema: deep, defaults: {} });
  const state = (root) =>
    [...root.querySelectorAll(".jf-drawer")].map((d) => [
      d.dataset.drawer,
      d.classList.contains("jf-drawer--front")
        ? "front"
        : d.classList.contains("jf-drawer--back")
          ? "back"
          : d.classList.contains("jf-drawer--hidden")
            ? "hidden"
            : "?",
    ]);

  it("the first drawer is at the front; a child goes to the front and its parent back; a third hides the first", async () => {
    const { el, root } = await mountDeep();
    await open(el, root, "a");
    expect(state(root)).toEqual([["a", "front"]]);
    await open(el, root, "a.b");
    expect(state(root)).toEqual([
      ["a", "back"],
      ["a.b", "front"],
    ]);
    await open(el, root, "a.b.c");
    expect(state(root)).toEqual([
      ["a", "hidden"],
      ["a.b", "back"],
      ["a.b.c", "front"],
    ]);
  });

  it("a card in a drawer opens the next drawer even when the form re-renders mid-click", async () => {
    // A real click runs microtasks between listeners, so the form re-renders
    // (the card's drawer now behind) before the click bubbles out of it.
    const { el, root } = await mountDeep();
    await open(el, root, "a");
    const inner = card(root, "a.b");
    inner.addEventListener("click", () => el.performUpdate());
    inner.click();
    await el.updateComplete;
    expect(state(root)).toEqual([
      ["a", "back"],
      ["a.b", "front"],
    ]);
  });

  it("a click on the back drawer's strip goes back, without using what it hits", async () => {
    const { el, root } = await mountDeep();
    await open(el, root, "a");
    await open(el, root, "a.b");
    card(root, "a.b").click();
    await el.updateComplete;
    expect(state(root)).toEqual([["a", "front"]]);
  });

  it("the front drawer is 80% wide, the one behind it 90%", async () => {
    const { el } = await mountDeep();
    const css = el.constructor.elementStyles.map((s) => s.cssText).join("\n");
    expect(css).toMatch(/\.jf-drawer--front\s*\{[^}]*width: 80%/);
    expect(css).toMatch(/\.jf-drawer--back\s*\{[^}]*width: 90%/);
    expect(css).toMatch(/\.jf-drawer--hidden\s*\{[^}]*visibility: hidden/);
  });

  it("a drawer going hidden stays in view until the one in front has widened over it", async () => {
    const { el } = await mountDeep();
    const css = el.constructor.elementStyles.map((s) => s.cssText).join("\n");
    const widen = css.match(/\.jf-drawer\s*\{[^}]*transition: width ([\d.]+s)/)[1];
    // Hiding waits for the widening; showing again does not (the one in
    // front shrinks off it).
    expect(css).toMatch(
      new RegExp(
        `\\.jf-drawer--hidden\\s*\\{[^}]*transition:\\s*width ${widen}[^;]*,\\s*visibility 0s ${widen}`,
      ),
    );
    expect(css).not.toMatch(/\.jf-drawer\s*\{[^}]*visibility 0s [\d.]/);
  });

  it("the shadow runs past the top and bottom, so its blur does not round the drawers' corners", async () => {
    const { el } = await mountDeep();
    const css = el.constructor.elementStyles.map((s) => s.cssText).join("\n");
    const rule = css.match(/\.jf-drawer-shadow\s*\{([^}]*)\}/)[1];
    expect(rule).toMatch(/top: -\d+px/);
    expect(rule).toMatch(/bottom: -\d+px/);
    // The layer clips it to the area.
    expect(css).toMatch(/\.jf-layer\s*\{[^}]*overflow: hidden/);
  });

  it("one shadow and one mask for the whole stack; the drawers cast none", async () => {
    const { el, root } = await mountDeep();
    expect(root.querySelector(".jf-drawer-shadow")).toBeNull();
    await open(el, root, "a");
    await open(el, root, "a.b");
    expect(root.querySelectorAll(".jf-drawer-shadow").length).toBe(1);
    expect(root.querySelectorAll(".jf-mask").length).toBe(1);
    // The shadow is as wide as the widest drawer in view.
    expect(root.querySelector(".jf-drawer-shadow").classList.contains("jf-drawer--back")).toBe(
      true,
    );
    const css = el.constructor.elementStyles.map((s) => s.cssText).join("\n");
    expect(css).not.toMatch(/\.jf-drawer\s*\{[^}]*box-shadow/);
    expect(css).toMatch(/\.jf-drawer-shadow\s*\{[^}]*box-shadow/);
  });

  it("the header shows the drawer's name only; close returns to the parent", async () => {
    const { el, root } = await mountDeep();
    await open(el, root, "a");
    await open(el, root, "a.b");
    expect(drawer(root, "a.b").querySelector(".jf-drawer-trail")).toBeNull();
    expect(
      drawer(root, "a.b")
        .querySelector(".jf-drawer-heading")
        .textContent.replace(/\s+/g, " ")
        .trim(),
    ).toBe("B");
    drawer(root, "a.b").querySelector('button[aria-label="Close B"]').click();
    await el.updateComplete;
    expect(state(root)).toEqual([["a", "front"]]);
  });

  it("Escape closes the front drawer; a click on the parent's strip goes back to it; the mask closes all", async () => {
    const { el, root } = await mountDeep();
    await open(el, root, "a");
    await open(el, root, "a.b");
    await open(el, root, "a.b.c");
    drawer(root, "a.b.c").dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, composed: true }),
    );
    await el.updateComplete;
    expect(state(root).map(([k]) => k)).toEqual(["a", "a.b"]);
    await open(el, root, "a.b.c");
    drawer(root, "a").click();
    await el.updateComplete;
    expect(state(root)).toEqual([
      ["a", "hidden"],
      ["a.b", "back"],
      ["a.b.c", "front"],
    ]);
    drawer(root, "a.b").click();
    await el.updateComplete;
    expect(state(root)).toEqual([
      ["a", "back"],
      ["a.b", "front"],
    ]);
    root.querySelector(".jf-mask").click();
    await el.updateComplete;
    expect(state(root)).toEqual([]);
  });

  it("drawerArea: the drawers cover that element's box (a whole cell, tab bar included)", async () => {
    const area = document.createElement("div");
    area.getBoundingClientRect = () => ({
      left: 10,
      top: 20,
      right: 510,
      bottom: 420,
      width: 500,
      height: 400,
    });
    document.body.appendChild(area);
    const { el, root } = await mount({ schema: deep, defaults: {}, drawerArea: area });
    await open(el, root, "a");
    const layer = root.querySelector(".jf-layer");
    expect(layer.classList.contains("jf-layer--area")).toBe(true);
    expect([layer.style.left, layer.style.top, layer.style.width, layer.style.height]).toEqual([
      "10px",
      "20px",
      "500px",
      "400px",
    ]);
    const css = el.constructor.elementStyles.map((s) => s.cssText).join("\n");
    expect(css).toMatch(/\.jf-layer--area\s*\{[^}]*position: fixed/);
  });

  it("while a drawer is open its area is covered: the tab's focus line hides", async () => {
    const area = document.createElement("div");
    const tab = document.createElement("div");
    area.appendChild(tab);
    document.body.appendChild(area);
    tab.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      width: 100,
      height: 30,
      right: 100,
      bottom: 30,
    });
    window.dispatchEvent(new Event("focus"));
    const owner = {};
    focusLineLayer().show(tab, owner);
    expect(focusLineLayer().element.style.display).toBe("block");
    const { el, root } = await mount({ schema: deep, defaults: {}, drawerArea: area });
    await open(el, root, "a");
    expect(focusLineLayer().element.style.display).toBe("none");
    root.querySelector(".jf-mask").click();
    await el.updateComplete;
    expect(focusLineLayer().element.style.display).toBe("block");
    focusLineLayer().hide(owner);
  });

  it("drawersOpen: whether a drawer is open (the host holds its own shortcuts meanwhile)", async () => {
    const { el, root } = await mountDeep();
    expect(el.drawersOpen).toBe(false);
    await open(el, root, "a");
    expect(el.drawersOpen).toBe(true);
    root.querySelector(".jf-mask").click();
    await el.updateComplete;
    expect(el.drawersOpen).toBe(false);
  });

  it("Tab stays in the front drawer: past its last control to its first, and back", async () => {
    const { el, root } = await mountDeep();
    const d = await open(el, root, "a");
    const close = d.querySelector(".jf-drawer-close");
    // The last control is the bottom bar's JSON view button.
    const last = d.querySelector('.jf-drawer-foot button[aria-label="JSON view"]');
    last.focus();
    last.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, composed: true }));
    expect(root.activeElement).toBe(close);
    close.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, composed: true }),
    );
    expect(root.activeElement).toBe(last);
  });

  it("the head is one line as tall as the tab bar it covers: the drawer's name", async () => {
    const { el, root } = await mountDeep();
    await open(el, root, "a");
    await open(el, root, "a.b");
    const heading = drawer(root, "a.b").querySelector(".jf-drawer-heading");
    expect(heading.textContent.replace(/\s+/g, " ").trim()).toBe("B");
    const css = el.constructor.elementStyles.map((s) => s.cssText).join("\n");
    expect(css).toMatch(/\.jf-drawer-head\s*\{[^}]*height: 35px/);
  });

  it("the form scrolls itself, so the drawers cover what is in view", async () => {
    const { el, root } = await mountDeep();
    expect(root.querySelector(".jf-scroll")).not.toBeNull();
    const css = el.constructor.elementStyles.map((s) => s.cssText).join("\n");
    expect(css).toMatch(/\.jf-scroll\s*\{[^}]*overflow: auto/);
    expect(css).toMatch(/\.jf-layer\s*\{[^}]*position: absolute/);
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

  it("a map with a default has Reset on its card, greyed out until the user changes it", async () => {
    const { el, root, changes } = await mountMap();
    const reset = () => card(root, "hosts").querySelector('button[aria-label="Reset Hosts"]');
    expect(reset().disabled).toBe(true);
    el.value = { hosts: { b: { url: "b.example" } } };
    await el.updateComplete;
    reset().click();
    await el.updateComplete;
    expect(changes.at(-1)).toEqual({});
  });
  const segs = (root) => [...drawer(root, "hosts").querySelectorAll(".jf-sub:not(.jf-new)")];
  const btn = (root, label) => root.querySelector(`button[aria-label="${label}"]`);

  it("a map of objects: its drawer has a card per key; the x-keysOf one is Default", async () => {
    const { el, root } = await mountMap({ hosts: { b: { url: "b.example" } } });
    await open(el, root, "hosts");
    expect(segs(root).map((s) => s.querySelector(".jf-sub-title").textContent.trim())).toEqual([
      "a",
      "b",
    ]);
    expect(segs(root)[0].querySelector(".jf-pill").textContent).toContain("Default");
    expect(segs(root)[1].querySelector(".jf-pill")).toBeNull();
  });

  it("x-keysOf: the setting is a menu of the map's keys; Make default sets it", async () => {
    const { el, root, changes } = await mountMap({ hosts: { b: {} } });
    const select = control(root, "defaultHost");
    expect(select.options.map((o) => o.label)).toEqual(["a", "b"]);
    await open(el, root, "hosts");
    btn(root, "Make b the default host").click();
    await el.updateComplete;
    expect(changes.at(-1)).toEqual({ hosts: { b: {} }, defaultHost: "b" });
  });

  it("opening an entry shows its fields; editing one sets it", async () => {
    const { el, root, changes } = await mountMap();
    await open(el, root, "hosts");
    await open(el, root, "hosts.a");
    await typeInto(el, control(root, "hosts.a.url"), "x.example");
    expect(changes.at(-1)).toEqual({ hosts: { a: { url: "x.example" } } });
  });

  it("the empty row takes a new key: Enter (or leaving it) adds the entry and opens it", async () => {
    const { el, root, changes } = await mountMap();
    await open(el, root, "hosts");
    expect(drawer(root, "hosts").querySelector(".jf-add")).toBeNull();
    const key = () =>
      drawer(root, "hosts").querySelector('.jf-new input[aria-label="New key for Hosts"]');
    await typeInto(el, key(), "c");
    // Typing alone does not add it (each key typed would be a new entry).
    expect(changes.at(-1)).not.toEqual({ hosts: { c: {} } });
    key().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await el.updateComplete;
    expect(changes.at(-1)).toEqual({ hosts: { c: {} } });
    expect(drawer(root, "hosts.c")).not.toBeNull();
    expect(key().value).toBe("");
  });

  it("a map of objects: the empty row is a card like the others: the key, then what a new entry holds, a greyed chevron", async () => {
    const { el, root, changes } = await mountMap();
    await open(el, root, "hosts");
    const row = () => drawer(root, "hosts").querySelector(".jf-sub.jf-new");
    expect(row().querySelector('input[aria-label="New key for Hosts"]')).not.toBeNull();
    expect(row().querySelector(".jf-meta").textContent.replace(/\s+/g, " ").trim()).toBe(
      "1 property · 0 set",
    );
    const chev = () => row().querySelector(".jf-chev");
    expect(chev().getAttribute("aria-disabled")).toBe("true");
    await typeInto(el, row().querySelector("input"), "c");
    expect(chev().getAttribute("aria-disabled")).toBe("false");
    chev().click();
    await el.updateComplete;
    expect(changes.at(-1)).toEqual({ hosts: { c: {} } });
    expect(drawer(root, "hosts.c")).not.toBeNull();
  });

  it("a map of objects: a taken key says so on the empty card's second row", async () => {
    const { el, root } = await mountMap();
    await open(el, root, "hosts");
    const row = drawer(root, "hosts").querySelector(".jf-sub.jf-new");
    await typeInto(el, row.querySelector("input"), "a");
    expect(row.querySelector(".jf-meta-error").textContent).toContain("taken");
    expect(row.querySelector(".jf-chev").getAttribute("aria-disabled")).toBe("true");
  });

  it("the empty card is as tall as a card: the key input sits on the title line", async () => {
    const { el } = await mountMap();
    const css = el.constructor.elementStyles.map((s) => s.cssText).join("\n");
    expect(css).toMatch(/\.jf-new-key\s*\{[^}]*padding: 0/);
    expect(css).toMatch(/\.jf-new-key\s*\{[^}]*font-size: 13px/);
    expect(css).toMatch(/\.jf-chev\[aria-disabled="true"\]\s*\{[^}]*opacity/);
  });

  it("a key that is taken is not added and is marked", async () => {
    const { el, root, changes } = await mountMap();
    await open(el, root, "hosts");
    const key = drawer(root, "hosts").querySelector(
      '.jf-new input[aria-label="New key for Hosts"]',
    );
    await typeInto(el, key, "a");
    key.dispatchEvent(new Event("change", { bubbles: true }));
    await el.updateComplete;
    expect(changes).toEqual([]);
    expect(key.getAttribute("aria-invalid")).toBe("true");
  });

  it("a map of values: a new key adds a row for its value", async () => {
    const { el, root, changes } = await mountMap({ levels: { Low: "low" } });
    await open(el, root, "levels");
    const key = drawer(root, "levels").querySelector(
      '.jf-new input[aria-label="New key for Levels"]',
    );
    await typeInto(el, key, "High");
    key.dispatchEvent(new Event("change", { bubbles: true }));
    await el.updateComplete;
    expect(Object.keys(changes.at(-1).levels)).toEqual(["Low", "High"]);
    expect(fieldOf(root, "levels.High")).not.toBeNull();
  });

  it("renames and removes the user's entries; the default follows a rename", async () => {
    const { el, root, changes } = await mountMap({ defaultHost: "b", hosts: { b: { url: "b" } } });
    await open(el, root, "hosts");
    await open(el, root, "hosts.b");
    const key = drawer(root, "hosts.b").querySelector('input[aria-label="Key of b"]');
    key.value = "d";
    key.dispatchEvent(new Event("change", { bubbles: true }));
    await el.updateComplete;
    expect(changes.at(-1)).toEqual({ defaultHost: "d", hosts: { d: { url: "b" } } });
    // Its drawer follows the rename.
    expect(drawer(root, "hosts.d")).not.toBeNull();
    drawer(root, "hosts.d").querySelector('button[aria-label="Close d"]').click();
    await el.updateComplete;
    btn(root, "Remove d from Hosts").click();
    await el.updateComplete;
    expect(changes.at(-1)).toEqual({ defaultHost: "d" });
  });

  it("an entry from the defaults cannot be removed or renamed", async () => {
    const { el, root } = await mountMap();
    await open(el, root, "hosts");
    expect(btn(root, "Remove a from Hosts").disabled).toBe(true);
    await open(el, root, "hosts.a");
    expect(drawer(root, "hosts.a").querySelector('input[aria-label="Key of a"]').disabled).toBe(
      true,
    );
  });

  it("a map of values: one row per key; clearing a nullable value sets null", async () => {
    const { el, root, changes } = await mountMap({ levels: { Low: "low" } });
    await open(el, root, "levels");
    const input = control(root, "levels.Low");
    expect(input.value).toBe("low");
    await typeInto(el, input, "");
    expect(changes.at(-1)).toEqual({ levels: { Low: null } });
  });
});

describe("json-form drawer views", () => {
  const schema = {
    type: "object",
    properties: {
      hosts: {
        type: "object",
        title: "Hosts",
        default: { a: { url: "a.example" } },
        additionalProperties: {
          type: "object",
          properties: { url: { type: "string", title: "URL" } },
        },
      },
    },
  };
  const defaults = { hosts: { a: { url: "a.example" } } };
  const mountHosts = (value = {}) => mount({ schema, defaults, value });
  const viewButton = (d, label) => d.querySelector(`.jf-drawer-foot button[aria-label="${label}"]`);
  const editorIn = (d) => d.querySelector("json-editor");

  it("every drawer has a bottom bar with one JSON view toggle, off: the form shows", async () => {
    const { el, root } = await mountHosts();
    const d = await open(el, root, "hosts");
    expect(d.querySelectorAll(".jf-drawer-foot button").length).toBe(1);
    expect(viewButton(d, "JSON view").getAttribute("aria-pressed")).toBe("false");
    expect(editorIn(d)).toBeNull();
  });

  it("JSON view: the drawer's value in a JSON editor, its defaults shown", async () => {
    const { el, root } = await mountHosts({ hosts: { b: { url: "b.example" } } });
    const d = await open(el, root, "hosts");
    viewButton(d, "JSON view").click();
    await el.updateComplete;
    const editor = editorIn(drawer(root, "hosts"));
    expect(editor).not.toBeNull();
    expect(editor.value).toEqual({ a: { url: "a.example" }, b: { url: "b.example" } });
    expect(editor.showDefaults).toBe(true);
    expect(editor.defaults).toEqual({ a: { url: "a.example" } });
    expect(viewButton(drawer(root, "hosts"), "JSON view").getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(drawer(root, "hosts").querySelector(".jf-sub")).toBeNull();
  });

  it("an edit in the JSON view stores only what differs from the defaults", async () => {
    const { el, root, changes } = await mountHosts();
    const d = await open(el, root, "hosts");
    viewButton(d, "JSON view").click();
    await el.updateComplete;
    editorIn(drawer(root, "hosts")).dispatchEvent(
      new CustomEvent("json-editor-change", {
        detail: { value: { a: { url: "a.example" }, c: { url: "c.example" } } },
      }),
    );
    await el.updateComplete;
    expect(changes.at(-1)).toEqual({ hosts: { c: { url: "c.example" } } });
    // Back to only the defaults: the setting is reset.
    editorIn(drawer(root, "hosts")).dispatchEvent(
      new CustomEvent("json-editor-change", { detail: { value: { a: { url: "a.example" } } } }),
    );
    await el.updateComplete;
    expect(changes.at(-1)).toEqual({});
  });

  it("an overwrite in the JSON view sets that value inside the drawer's", async () => {
    const { el, root, changes } = await mountHosts({ hosts: { b: { url: "b.example" } } });
    const d = await open(el, root, "hosts");
    viewButton(d, "JSON view").click();
    await el.updateComplete;
    editorIn(drawer(root, "hosts")).dispatchEvent(
      new CustomEvent("json-editor-overwrite", { detail: { path: ["b", "url"], value: "z" } }),
    );
    await el.updateComplete;
    expect(changes.at(-1)).toEqual({ hosts: { b: { url: "z" } } });
  });

  it("JSON view toggles back off; each drawer keeps its own view; a reopened drawer is a form", async () => {
    const { el, root } = await mountHosts();
    await open(el, root, "hosts");
    await open(el, root, "hosts.a");
    viewButton(drawer(root, "hosts.a"), "JSON view").click();
    await el.updateComplete;
    expect(editorIn(drawer(root, "hosts.a"))).not.toBeNull();
    expect(editorIn(drawer(root, "hosts"))).toBeNull();
    viewButton(drawer(root, "hosts.a"), "JSON view").click();
    await el.updateComplete;
    expect(editorIn(drawer(root, "hosts.a"))).toBeNull();
    viewButton(drawer(root, "hosts.a"), "JSON view").click();
    await el.updateComplete;
    drawer(root, "hosts.a").querySelector(".jf-drawer-close").click();
    await el.updateComplete;
    await open(el, root, "hosts.a");
    expect(editorIn(drawer(root, "hosts.a"))).toBeNull();
  });

  it("the bar matches the tab's bottom bar; its corner button moves in from the window's corner", async () => {
    const { el } = await mountHosts();
    const css = el.constructor.elementStyles.map((s) => s.cssText).join("\n");
    expect(css).toMatch(/\.jf-drawer-foot\s*\{[^}]*height: 34px/);
    expect(css).toMatch(
      /\.jf-foot-btn:last-child\s*\{[^}]*padding-right: var\(--grid-edge-right-pad, 0px\)/,
    );
  });
});

describe("json-form grouped settings", () => {
  const editor = (title) => ({
    type: "object",
    title,
    properties: { fontSize: { type: "integer" } },
  });
  const schema = {
    type: "object",
    properties: {
      theme: { type: "string" },
      "editor/*": editor("editor/*"),
      "editor/file": editor("editor/file"),
      "editor/json": editor("editor/json"),
      dragConsumers: { type: "object", additionalProperties: { type: "string" } },
    },
  };
  const mountGroups = () => mount({ schema, defaults: {} });

  it("settings sharing a prefix (editor/…) are one card: a row each, no gaps", async () => {
    const { root } = await mountGroups();
    const groups = [...root.querySelectorAll(".jf-sub-group")];
    expect(groups.length).toBe(1);
    expect([...groups[0].children].map((c) => c.dataset.key)).toEqual([
      "editor/*",
      "editor/file",
      "editor/json",
    ]);
    // The next setting, not editor/…, is a card of its own.
    expect(card(root, "dragConsumers").parentElement.classList.contains("jf-sub-group")).toBe(
      false,
    );
  });

  it("each row of a grouped card still opens its own drawer", async () => {
    const { el, root } = await mountGroups();
    const d = await open(el, root, "editor/file");
    expect(d.querySelector(".jf-drawer-title").textContent).toContain("editor/file");
  });

  it("the group has the rounded corners; its rows are square, divided by a line", async () => {
    const { el } = await mountGroups();
    const css = el.constructor.elementStyles.map((s) => s.cssText).join("\n");
    expect(css).toMatch(/\.jf-sub-group\s*\{[^}]*border-radius: 6px[^}]*overflow: hidden/s);
    expect(css).toMatch(/\.jf-sub-group > \.jf-sub\s*\{[^}]*border-radius: 0/);
    expect(css).toMatch(/\.jf-sub-group > \.jf-sub \+ \.jf-sub\s*\{[^}]*border-top: 1px solid/);
  });

  it("a lone setting with a prefix is a plain card", async () => {
    const { root } = await mount({
      schema: { type: "object", properties: { "editor/*": editor("editor/*") } },
      defaults: {},
    });
    expect(root.querySelector(".jf-sub-group")).toBeNull();
  });
});

// @ts-nocheck
/**
 * <openp41ge-select> — a dropdown drawn by the toolkit instead of the native
 * <select>: a trigger showing the chosen option, and a list as wide as the
 * element, opened by click or keyboard. Choosing fires `change` with the
 * option's value.
 */
import { describe, it, expect, afterEach } from "vitest";
import "../../src/components/openp41ge-select";

const options = [
  { value: "a", label: "Alpha" },
  { value: "b", label: "Beta" },
  { value: "c", label: "Gamma" },
];

async function mount(props: Record<string, unknown> = {}) {
  const el = document.createElement("openp41ge-select");
  Object.assign(el, { options, value: "b", label: "Letter", ...props });
  const changes: string[] = [];
  el.addEventListener("change", (e) => changes.push(e.detail.value));
  document.body.appendChild(el);
  await el.updateComplete;
  return { el, root: el.shadowRoot, changes };
}

const trigger = (root) => root.querySelector('[role="combobox"]');
const list = (root) => root.querySelector('[role="listbox"]');
const items = (root) => [...root.querySelectorAll('[role="option"]')];

async function key(el, target, k) {
  target.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, composed: true }));
  await el.updateComplete;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("openp41ge-select", () => {
  it("shows the chosen option's label; the placeholder when none is chosen", async () => {
    const { el, root } = await mount();
    expect(trigger(root).textContent).toContain("Beta");
    expect(trigger(root).getAttribute("aria-label")).toBe("Letter");
    el.value = "";
    el.placeholder = "Not set";
    await el.updateComplete;
    expect(trigger(root).textContent).toContain("Not set");
  });

  it("click opens the list, the chosen option marked; it is as wide as the element", async () => {
    const { el, root } = await mount();
    el.getBoundingClientRect = () => ({
      left: 40,
      top: 100,
      bottom: 130,
      right: 440,
      width: 400,
      height: 30,
    });
    expect(list(root)).toBeNull();
    trigger(root).click();
    await el.updateComplete;
    expect(trigger(root).getAttribute("aria-expanded")).toBe("true");
    expect(items(root).map((o) => o.textContent.trim())).toEqual(["Alpha", "Beta", "Gamma"]);
    expect(items(root).map((o) => o.getAttribute("aria-selected"))).toEqual([
      "false",
      "true",
      "false",
    ]);
    expect(list(root).style.width).toBe("400px");
    expect(list(root).style.left).toBe("40px");
  });

  it("alignTo: the list lines up with the closest ancestor matching it", async () => {
    const card = document.createElement("div");
    card.className = "card";
    card.getBoundingClientRect = () => ({
      left: 20,
      top: 100,
      bottom: 130,
      right: 520,
      width: 500,
      height: 30,
    });
    document.body.appendChild(card);
    const el = document.createElement("openp41ge-select");
    Object.assign(el, { options, value: "a", alignTo: ".card" });
    card.appendChild(el);
    await el.updateComplete;
    trigger(el.shadowRoot).click();
    await el.updateComplete;
    expect(list(el.shadowRoot).style.width).toBe("500px");
    expect(list(el.shadowRoot).style.left).toBe("20px");
  });

  it("choosing an option fires change with its value and closes", async () => {
    const { el, root, changes } = await mount();
    trigger(root).click();
    await el.updateComplete;
    items(root)[2].click();
    await el.updateComplete;
    expect(changes).toEqual(["c"]);
    expect(el.value).toBe("c");
    expect(list(root)).toBeNull();
  });

  it("keyboard: ArrowDown opens, arrows move, Enter chooses, Escape closes", async () => {
    const { el, root, changes } = await mount();
    await key(el, trigger(root), "ArrowDown");
    expect(list(root)).not.toBeNull();
    await key(el, trigger(root), "ArrowDown");
    expect(items(root)[2].classList.contains("active")).toBe(true);
    await key(el, trigger(root), "Enter");
    expect(changes).toEqual(["c"]);
    expect(list(root)).toBeNull();
    await key(el, trigger(root), "Enter");
    await key(el, trigger(root), "ArrowUp");
    await key(el, trigger(root), "Escape");
    expect(list(root)).toBeNull();
    expect(changes).toEqual(["c"]);
  });

  it("a press outside closes it", async () => {
    const { el, root } = await mount();
    trigger(root).click();
    await el.updateComplete;
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true, composed: true }));
    await el.updateComplete;
    expect(list(root)).toBeNull();
  });

  it("disabled: does not open", async () => {
    const { el, root } = await mount({ disabled: true });
    trigger(root).click();
    await el.updateComplete;
    expect(list(root)).toBeNull();
  });
});

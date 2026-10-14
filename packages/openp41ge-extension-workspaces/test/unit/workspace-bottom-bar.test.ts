// @vitest-environment jsdom
/**
 * The workspace editor's bottom bar keeps its top border line wherever it is
 * mounted. In a window the editor sits in the document, where the platform's
 * global reset (Tailwind preflight: `* { border-width: 0 }`) applies to the
 * bar's host element and beats its own `:host { border-top }` — the line
 * vanished. The line is drawn inside the bar's shadow root, out of reach of
 * document styles.
 */
import { describe, it, expect, afterEach } from "vitest";
import "@openp41ge-extension-workspaces/workspace-bottom-bar";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("we-bottom-bar", () => {
  it("draws its top border inside its shadow root, not on the host", async () => {
    const bar = document.createElement("we-bottom-bar") as HTMLElement & {
      updateComplete: Promise<unknown>;
    };
    document.body.append(bar);
    await bar.updateComplete;

    const inner = bar.shadowRoot!.querySelector<HTMLElement>(".wbb-bar");
    expect(inner).not.toBeNull();
    // (jsdom cannot compute a border shorthand that uses var(), so the rules
    // are read instead.)
    const css = [...bar.shadowRoot!.querySelectorAll("style")].map((s) => s.textContent).join("");
    expect(css.match(/\.wbb-bar\s*\{([^}]*)\}/)?.[1] ?? "").toMatch(/border-top:\s*1px solid/);
    // The host itself carries no border for the reset to remove.
    expect(css.match(/:host\s*\{([^}]*)\}/)?.[1] ?? "").not.toMatch(/border/);
  });
});

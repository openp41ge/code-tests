/**
 * A sidebar always sits against the window's edge, so it publishes the same
 * corner pad the grid does for a cell flush with a rounded corner
 * (`--grid-edge-right-pad` / `--grid-edge-left-pad`): a tab's bottom-bar
 * button in the corner moves 8px in from the rounded edge.
 */
import { describe, it, expect, afterEach } from "vitest";
import "../../../src/renderer/components/openp41ge-sidebar";

afterEach(() => {
  document.body.innerHTML = "";
});

async function content(side: "left" | "right") {
  const el = document.createElement("openp41ge-sidebar") as HTMLElement & {
    side: string;
    updateComplete: Promise<unknown>;
  };
  el.side = side;
  document.body.appendChild(el);
  await el.updateComplete;
  return el.querySelector<HTMLElement>(".sidebar-content")!;
}

describe("sidebar corner pad", () => {
  it("the right sidebar pads its right corner, not its left", async () => {
    const c = await content("right");
    expect(c.style.getPropertyValue("--grid-edge-right-pad")).toBe("8px");
    expect(c.style.getPropertyValue("--grid-edge-left-pad")).toBe("0px");
  });

  it("the left sidebar pads its left corner, not its right", async () => {
    const c = await content("left");
    expect(c.style.getPropertyValue("--grid-edge-left-pad")).toBe("8px");
    expect(c.style.getPropertyValue("--grid-edge-right-pad")).toBe("0px");
  });
});

/**
 * <openp41ge-releases-pane>, the manager window's Releases sidebar tab.
 *
 * Releases are rows. The Releases view (the default) lists every release in
 * the range the update channel setting allows, newest first; the bottom bar's
 * toggle switches to the Channels view, the latest of each channel in that
 * range. Skeleton rows show while there is no list yet. Clicking a row asks
 * the manager to open the release in a grid tab (a double click pins it).
 * The list comes from the main process's background check; the refresh
 * button checks now.
 */
import { describe, test, expect, afterEach } from "vitest";
import "../../../src/renderer/components/openp41ge-releases-pane";
import { setReleasesDeps } from "../../../src/renderer/services/releases-deps";
import { fakeReleases, tick, ALPHA_8, STABLE, release } from "./releases-fakes";

type Pane = HTMLElement & { updateComplete: Promise<unknown> };

async function mount(fake: ReturnType<typeof fakeReleases>): Promise<Pane> {
  setReleasesDeps(fake.deps);
  const el = document.createElement("openp41ge-releases-pane") as Pane;
  document.body.appendChild(el);
  await tick();
  await el.updateComplete;
  return el;
}

const root = (el: Pane) => el.shadowRoot!;
const rows = (el: Pane) => [...root(el).querySelectorAll<HTMLElement>(".rp-row")];
const tags = (el: Pane) => rows(el).map((r) => r.dataset.tag);
const toggle = (el: Pane) =>
  root(el).querySelector<HTMLButtonElement>('[aria-label="Show the latest of each channel"]')!;

afterEach(() => {
  document.body.innerHTML = "";
  setReleasesDeps(null);
});

describe("releases pane", () => {
  test("lists every release in the setting's range as rows, newest first", async () => {
    const el = await mount(fakeReleases({ channel: "alpha" }));
    expect(tags(el)).toEqual(["v0.1.0-alpha.8", "v0.1.0-alpha.7", "v0.1.0-beta.1", "v0.1.0"]);
    expect(rows(el)[0].textContent).toContain("Alpha");
  });

  test("the toggle switches to the latest of each channel, and back", async () => {
    const el = await mount(fakeReleases({ channel: "alpha" }));
    expect(toggle(el).getAttribute("aria-pressed")).toBe("false");
    toggle(el).click();
    await el.updateComplete;
    expect(toggle(el).getAttribute("aria-pressed")).toBe("true");
    expect(tags(el)).toEqual(["v0.1.0-alpha.8", "v0.1.0-beta.1", "v0.1.0"]);
    toggle(el).click();
    await el.updateComplete;
    expect(tags(el)).toHaveLength(4);
  });

  test("follows the update channel setting", async () => {
    const fake = fakeReleases({ channel: "alpha" });
    const el = await mount(fake);
    fake.setChannel("latest");
    await el.updateComplete;
    expect(tags(el)).toEqual(["v0.1.0"]);
  });

  test("shows skeleton rows until there is a list", async () => {
    const fake = fakeReleases({ snapshot: { releases: [], fetchedAt: null, checking: true } });
    const el = await mount(fake);
    expect(root(el).querySelectorAll(".rp-skeleton").length).toBeGreaterThan(0);
    expect(rows(el)).toHaveLength(0);

    fake.push({ releases: [ALPHA_8], fetchedAt: 2, checking: false });
    await el.updateComplete;
    expect(root(el).querySelectorAll(".rp-skeleton")).toHaveLength(0);
    expect(tags(el)).toEqual(["v0.1.0-alpha.8"]);
  });

  test("keeps the rows while a check runs, and shows new releases when it ends", async () => {
    const fake = fakeReleases();
    const el = await mount(fake);
    fake.push({ checking: true });
    await el.updateComplete;
    expect(root(el).querySelectorAll(".rp-skeleton")).toHaveLength(0);
    fake.push({ checking: false, releases: [release("v0.1.0-alpha.9", "2026-10-13T00:00:00Z"), ALPHA_8] });
    await el.updateComplete;
    expect(tags(el)[0]).toBe("v0.1.0-alpha.9");
  });

  test("says so when the first check fails", async () => {
    const el = await mount(
      fakeReleases({ snapshot: { releases: [], fetchedAt: null, error: "offline" } }),
    );
    expect(root(el).querySelector(".rp-state--error")?.textContent).toContain("Couldn't check for releases");
  });

  test("marks the installed release with a Current pill, not a version in the bottom bar", async () => {
    const el = await mount(fakeReleases({ installed: "0.1.0-alpha.7" }));
    const current = rows(el).filter((r) => r.querySelector(".rp-chip--current"));
    expect(current.map((r) => r.dataset.tag)).toEqual(["v0.1.0-alpha.7"]);
    expect(current[0].querySelector(".rp-chip--current")!.textContent).toBe("Current");
    expect(root(el).querySelector(".rp-footer")!.textContent).not.toContain("0.1.0-alpha.7");
  });

  test("renders release text as text, not markup", async () => {
    const el = await mount(
      fakeReleases({ snapshot: { releases: [{ ...STABLE, tag_name: "v0.1.0<img src=x>" }] }, channel: "latest" }),
    );
    expect(root(el).querySelector("img")).toBeNull();
  });

  test("a row click asks to open the release (preview), a double click pins it", async () => {
    const el = await mount(fakeReleases());
    const opened: Array<{ tag: string; pinned: boolean }> = [];
    document.addEventListener("open-release", (e) => opened.push((e as CustomEvent).detail));
    rows(el)[1].click();
    rows(el)[1].dispatchEvent(new MouseEvent("dblclick", { bubbles: true, composed: true }));
    expect(opened).toEqual([
      { tag: "v0.1.0-alpha.7", pinned: false },
      { tag: "v0.1.0-alpha.7", pinned: true },
    ]);
  });

  test("the refresh button checks now", async () => {
    const fake = fakeReleases();
    const el = await mount(fake);
    root(el).querySelector<HTMLButtonElement>('[aria-label="Check for releases"]')!.click();
    expect(fake.deps.refreshReleases).toHaveBeenCalled();
  });

  test("while a check runs, the refresh button shows it (busy), not a Checking label", async () => {
    const fake = fakeReleases();
    const el = await mount(fake);
    const refresh = () => root(el).querySelector<HTMLButtonElement>('[aria-label="Check for releases"]')!;
    expect(refresh().getAttribute("aria-busy")).toBe("false");
    fake.push({ checking: true });
    await el.updateComplete;
    expect(refresh().getAttribute("aria-busy")).toBe("true");
    expect(root(el).querySelector(".rp-footer")!.textContent).not.toContain("Checking");
    fake.push({ checking: false });
    await el.updateComplete;
    expect(refresh().getAttribute("aria-busy")).toBe("false");
  });
});

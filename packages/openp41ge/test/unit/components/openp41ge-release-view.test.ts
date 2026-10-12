/**
 * <openp41ge-release-view>, a release's grid tab (`release`, `{ tag }`): its
 * tag, channel, date, notes (as text) and a link to it on GitHub. The build
 * the updater can install (the latest of the update channel) offers
 * Download; clicking it shows "Downloading…" at once (the updater may first
 * check again, and some downloads send no progress), then the progress, then
 * Update, which restarts into it.
 */
import { describe, test, expect, afterEach } from "vitest";
import "../../../src/renderer/components/openp41ge-release-view";
import { setReleasesDeps } from "../../../src/renderer/services/releases-deps";
import {
  RELEASE_APP_TYPE,
  openReleaseTab,
  releaseAppRegistration,
} from "../../../src/renderer/apps/release";
import { fakeReleases, tick } from "./releases-fakes";

type View = HTMLElement & { tag: string; updateComplete: Promise<unknown> };

async function mount(fake: ReturnType<typeof fakeReleases>, tag: string): Promise<View> {
  setReleasesDeps(fake.deps);
  const el = document.createElement("openp41ge-release-view") as View;
  el.tag = tag;
  document.body.appendChild(el);
  await tick();
  await el.updateComplete;
  return el;
}

const root = (el: View) => el.shadowRoot!;
const button = (el: View, label: string) =>
  [...root(el).querySelectorAll("button")].find((b) => b.textContent?.trim() === label);

afterEach(() => {
  document.body.innerHTML = "";
  setReleasesDeps(null);
});

describe("release view", () => {
  test("shows the release: tag, channel, notes as text, and a GitHub link", async () => {
    const fake = fakeReleases();
    fake.deps.getReleases = async () => ({
      releases: [{ ...(await fakeReleases().deps.getReleases()).releases[1], body: "<b>bold</b> notes" }],
      fetchedAt: 1,
      checking: false,
      error: null,
    });
    const el = await mount(fake, "v0.1.0-alpha.7");
    expect(root(el).textContent).toContain("v0.1.0-alpha.7");
    expect(root(el).textContent).toContain("Alpha");
    expect(root(el).querySelector(".rv-notes")?.textContent).toContain("<b>bold</b> notes");
    expect(root(el).querySelector("b")).toBeNull();
    expect(root(el).querySelector<HTMLAnchorElement>("a.rv-github")?.href).toContain(
      "/releases/tag/v0.1.0-alpha.7",
    );
  });

  test("offers Download only on the build the updater can install", async () => {
    const latest = await mount(fakeReleases({ channel: "alpha" }), "v0.1.0-alpha.8");
    expect(button(latest, "Download")).toBeDefined();
    document.body.innerHTML = "";
    const older = await mount(fakeReleases({ channel: "alpha" }), "v0.1.0-alpha.7");
    expect(button(older, "Download")).toBeUndefined();
    document.body.innerHTML = "";
    const installed = await mount(
      fakeReleases({ channel: "alpha", installed: "0.1.0-alpha.8" }),
      "v0.1.0-alpha.8",
    );
    expect(button(installed, "Download")).toBeUndefined();
    expect(root(installed).textContent).toContain("Installed");
  });

  test("Download shows Downloading… at once, then progress, then Update", async () => {
    let finish!: (s: UpdaterStatus) => void;
    const fake = fakeReleases({ download: () => new Promise((r) => (finish = r)) });
    const el = await mount(fake, "v0.1.0-alpha.8");
    button(el, "Download")!.click();
    await el.updateComplete;
    expect(fake.deps.download).toHaveBeenCalled();
    expect(button(el, "Download")).toBeUndefined();
    expect(root(el).textContent).toContain("Downloading…");

    fake.emitStatus({
      state: "downloading",
      version: "0.1.0-alpha.8",
      progress: 42,
      bytesPerSecond: 1,
      transferred: 42,
      total: 100,
    });
    await el.updateComplete;
    expect(root(el).textContent).toContain("42%");

    fake.emitStatus({ state: "update-downloaded", version: "0.1.0-alpha.8" });
    finish({ state: "update-downloaded", version: "0.1.0-alpha.8" });
    await tick();
    await el.updateComplete;
    button(el, "Update")!.click();
    await tick();
    expect(fake.deps.quitAndInstall).toHaveBeenCalled();
  });

  test("a failed download shows the error and offers Download again", async () => {
    const fake = fakeReleases({
      download: async () => ({ state: "error", message: "no update available to download" }),
    });
    const el = await mount(fake, "v0.1.0-alpha.8");
    button(el, "Download")!.click();
    fake.emitStatus({ state: "error", message: "no update available to download" });
    await tick();
    await el.updateComplete;
    expect(root(el).textContent).toContain("no update available to download");
    expect(button(el, "Download")).toBeDefined();
  });

  test("says so for a release that is not in the list", async () => {
    const el = await mount(fakeReleases(), "v9.9.9");
    expect(root(el).textContent).toContain("isn't in the release list");
  });
});

describe("release grid tab", () => {
  test("is an app type whose tab is keyed by the release's tag", () => {
    expect(releaseAppRegistration.id).toBe(RELEASE_APP_TYPE);
    // The package icon, following the tab's text colour.
    expect(releaseAppRegistration.icon).toMatch(/^<svg[^>]*fill="currentColor"[^>]*>.*M440-183v-274L200-596/);
    const calls: unknown[][] = [];
    openReleaseTab({ openApp: (...args: unknown[]) => calls.push(args) }, "v0.1.0-alpha.8", true);
    expect(calls).toEqual([
      [RELEASE_APP_TYPE, "v0.1.0-alpha.8", { tag: "v0.1.0-alpha.8", path: "release:v0.1.0-alpha.8" }, undefined, true],
    ]);
  });

  test("its controller shows the release view for the tab's tag", async () => {
    setReleasesDeps(fakeReleases().deps);
    const controller = releaseAppRegistration.createController("t1");
    controller.restore({ tag: "v0.1.0-alpha.8", path: "release:v0.1.0-alpha.8" });
    const box = document.createElement("div");
    document.body.appendChild(box);
    controller.mount(box);
    const view = box.querySelector("openp41ge-release-view") as View;
    expect(view.tag).toBe("v0.1.0-alpha.8");
    expect(controller.snapshot()).toEqual({ tag: "v0.1.0-alpha.8", path: "release:v0.1.0-alpha.8" });
    controller.unmount();
    expect(box.children).toHaveLength(0);
  });
});

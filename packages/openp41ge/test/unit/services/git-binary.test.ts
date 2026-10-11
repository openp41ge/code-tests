/**
 * Unit tests for the startup git check: which git the platform uses, whether
 * it is usable (installed, new enough, not the macOS developer-tools stub),
 * and putting it first on PATH so everything in the main process runs it.
 */
import { describe, it, expect } from "vitest";
import {
  MIN_GIT_VERSION,
  gitProblemOf,
  parseGitVersion,
  resolveGit,
  withGitOnPath,
  type GitProbe,
} from "@openp41ge/main/services/git-binary";

/** A probe over a fake filesystem of git binaries and their `--version` output. */
function probe(
  binaries: Record<string, string>,
  opts: Partial<Pick<GitProbe, "platform" | "pathEnv" | "override">> & {
    xcodeTools?: boolean;
  } = {},
): GitProbe & { runs: string[] } {
  const runs: string[] = [];
  return {
    platform: opts.platform ?? "darwin",
    pathEnv: opts.pathEnv ?? "/usr/bin:/bin:/usr/sbin:/sbin",
    override: opts.override,
    runs,
    isExecutable: (p) => p in binaries,
    run: async (cmd, args) => {
      runs.push([cmd, ...args].join(" "));
      if (cmd === "xcode-select") return { ok: opts.xcodeTools ?? true, stdout: "" };
      return cmd in binaries ? { ok: true, stdout: binaries[cmd] } : { ok: false, stdout: "" };
    },
  };
}

describe("parseGitVersion", () => {
  it("reads the version from git's output, including vendor suffixes", () => {
    expect(parseGitVersion("git version 2.39.5 (Apple Git-154)\n")).toEqual([2, 39, 5]);
    expect(parseGitVersion("git version 2.45.1.windows.1")).toEqual([2, 45, 1]);
    expect(parseGitVersion("git version 2.17")).toEqual([2, 17, 0]);
    expect(parseGitVersion("nope")).toBeNull();
  });
});

describe("resolveGit", () => {
  it("uses the first git on PATH that is new enough", async () => {
    const result = await resolveGit(
      probe(
        {
          "/opt/homebrew/bin/git": "git version 2.47.0",
          "/usr/local/bin/git": "git version 2.30.0",
        },
        { pathEnv: "/opt/homebrew/bin:/usr/local/bin:/usr/bin" },
      ),
    );
    expect(result).toEqual({ ok: true, path: "/opt/homebrew/bin/git", version: "2.47.0" });
  });

  it("finds Homebrew git when the app is launched with a minimal PATH", async () => {
    const result = await resolveGit(
      probe({
        "/opt/homebrew/bin/git": "git version 2.47.0",
        "/usr/bin/git": "git version 2.39.5",
      }),
    );
    expect(result).toMatchObject({ ok: true, path: "/opt/homebrew/bin/git" });
  });

  it("skips a git that is too old and uses a newer one", async () => {
    const result = await resolveGit(
      probe(
        {
          "/usr/local/bin/git": "git version 2.10.0",
          "/opt/homebrew/bin/git": "git version 2.47.0",
        },
        { pathEnv: "/usr/local/bin" },
      ),
    );
    expect(result).toMatchObject({ ok: true, path: "/opt/homebrew/bin/git" });
  });

  it("reports a git that is too old when there is no other", async () => {
    const result = await resolveGit(probe({ "/usr/bin/git": "git version 2.10.0" }));
    expect(result.ok).toBe(false);
    expect(gitProblemOf(result)).toBe(
      `Git ${MIN_GIT_VERSION.join(".")} or newer is required; 2.10.0 is installed.`,
    );
  });

  it("never runs the macOS git stub when the developer tools are missing", async () => {
    const p = probe({ "/usr/bin/git": "git version 2.39.5" }, { xcodeTools: false });
    const result = await resolveGit(p);
    expect(result.ok).toBe(false);
    expect(gitProblemOf(result)).toContain("xcode-select --install");
    expect(p.runs).not.toContain("/usr/bin/git --version");
  });

  it("uses /usr/bin/git on macOS when the developer tools are installed", async () => {
    const result = await resolveGit(
      probe({ "/usr/bin/git": "git version 2.39.5 (Apple Git-154)" }),
    );
    expect(result).toEqual({ ok: true, path: "/usr/bin/git", version: "2.39.5" });
  });

  it("reports when no git is installed", async () => {
    const result = await resolveGit(probe({}, { platform: "linux", pathEnv: "/usr/bin:/bin" }));
    expect(result.ok).toBe(false);
    expect(gitProblemOf(result)).toMatch(/not found/i);
  });

  it("uses OPENP41GE_GIT when set, and only it", async () => {
    const ok = await resolveGit(
      probe(
        { "/custom/git": "git version 2.40.0", "/opt/homebrew/bin/git": "git version 2.47.0" },
        { override: "/custom/git" },
      ),
    );
    expect(ok).toMatchObject({ ok: true, path: "/custom/git" });
    const missing = await resolveGit(
      probe({ "/opt/homebrew/bin/git": "git version 2.47.0" }, { override: "/nope/git" }),
    );
    expect(missing.ok).toBe(false);
    // User-facing: no paths on the system.
    expect(gitProblemOf(missing)).toBe("Git was not found.");
  });

  it("looks for git.exe on Windows PATH and the default install", async () => {
    const result = await resolveGit(
      probe(
        { "C:\\Program Files\\Git\\cmd\\git.exe": "git version 2.45.1.windows.1" },
        { platform: "win32", pathEnv: "C:\\Windows\\system32;C:\\Windows" },
      ),
    );
    expect(result).toMatchObject({ ok: true, path: "C:\\Program Files\\Git\\cmd\\git.exe" });
  });
});

describe("withGitOnPath", () => {
  it("puts the resolved git's directory first on PATH, once", () => {
    const status = { ok: true as const, path: "/opt/homebrew/bin/git", version: "2.47.0" };
    expect(withGitOnPath(status, "/usr/bin:/bin", "darwin")).toBe(
      "/opt/homebrew/bin:/usr/bin:/bin",
    );
    expect(withGitOnPath(status, "/opt/homebrew/bin:/usr/bin", "darwin")).toBe(
      "/opt/homebrew/bin:/usr/bin",
    );
  });

  it("leaves PATH alone when git is unusable", () => {
    expect(withGitOnPath({ ok: false, problem: "x" }, "/usr/bin", "darwin")).toBe("/usr/bin");
  });

  it("uses ; on Windows", () => {
    const status = { ok: true as const, path: "C:\\Git\\cmd\\git.exe", version: "2.45.1" };
    expect(withGitOnPath(status, "C:\\Windows", "win32")).toBe("C:\\Git\\cmd;C:\\Windows");
  });
});

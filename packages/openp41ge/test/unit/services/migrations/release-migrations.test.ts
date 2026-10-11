/**
 * Downloading data migrations from releases: every release after the version
 * the data was last brought up to, through the running one, carries one
 * signed migrations.json; each is checked before any of its sets is used.
 */
import { describe, it, expect } from "vitest";
import crypto from "crypto";
import { compareVersions } from "@openp41ge/main/services/migrations/versions";
import { verifySignature } from "@openp41ge/main/services/migrations/signature";
import {
  fetchReleaseMigrations,
  releasesBetween,
} from "@openp41ge/main/services/migrations/release-migrations";

describe("compareVersions", () => {
  it("orders releases, pre-releases before their release, numbers numerically", () => {
    const sorted = [
      "0.1.0",
      "0.1.0-alpha.10",
      "v0.0.9",
      "0.1.0-beta.1",
      "0.1.0-alpha.9",
      "0.2.0",
    ].sort(compareVersions);
    expect(sorted).toEqual([
      "v0.0.9",
      "0.1.0-alpha.9",
      "0.1.0-alpha.10",
      "0.1.0-beta.1",
      "0.1.0",
      "0.2.0",
    ]);
  });
});

const keys = crypto.generateKeyPairSync("ed25519");
const publicKey = keys.publicKey.export({ type: "spki", format: "pem" }).toString();
const sign = (text: string) =>
  crypto.sign(null, Buffer.from(text), keys.privateKey).toString("base64");

describe("verifySignature", () => {
  it("accepts the signed bytes only, with the right key", () => {
    const text = '{"release":"0.1.0","sets":[]}';
    expect(verifySignature(Buffer.from(text), sign(text), publicKey)).toBe(true);
    expect(verifySignature(Buffer.from(text + " "), sign(text), publicKey)).toBe(false);
    const other = crypto
      .generateKeyPairSync("ed25519")
      .publicKey.export({ type: "spki", format: "pem" });
    expect(verifySignature(Buffer.from(text), sign(text), other.toString())).toBe(false);
    expect(verifySignature(Buffer.from(text), "not base64!", publicKey)).toBe(false);
  });
});

/** A GitHub release, with migrations.json (+ .sig) when `sets` is given. */
function release(tag: string, sets?: unknown[], opts: { draft?: boolean; badSig?: boolean } = {}) {
  const assets = sets
    ? [
        { name: "migrations.json", browser_download_url: `https://dl/${tag}/migrations.json` },
        {
          name: "migrations.json.sig",
          browser_download_url: `https://dl/${tag}/migrations.json.sig`,
        },
      ]
    : [];
  return { tag_name: tag, draft: !!opts.draft, assets };
}

describe("releasesBetween", () => {
  it("takes the published releases after `from`, through `to`, oldest first", () => {
    const releases = [
      release("v0.2.0"),
      release("v0.1.0"),
      release("v0.1.0-alpha.11"),
      release("v0.1.0-beta.1", undefined, { draft: true }),
      release("v0.1.0-alpha.10"),
    ];
    expect(releasesBetween(releases, "0.1.0-alpha.10", "0.1.0").map((r) => r.tag_name)).toEqual([
      "v0.1.0-alpha.11",
      "v0.1.0",
    ]);
  });
});

describe("fetchReleaseMigrations", () => {
  const set = (id: string) => ({ id, description: id, release: "x", steps: [] });

  function fakeFetch(releases: ReturnType<typeof release>[], files: Record<string, string>) {
    const seen: string[] = [];
    const fetchText = async (url: string) => {
      seen.push(url);
      if (url.startsWith("https://api.github.com/")) return JSON.stringify(releases);
      if (url in files) return files[url];
      throw new Error(`404 ${url}`);
    };
    return { fetchText, seen };
  }

  it("downloads each release's verified file in the range and returns its sets", async () => {
    const a = JSON.stringify({ release: "0.1.0-alpha.11", sets: [set("2026-10-a")] });
    const b = JSON.stringify({ release: "0.1.0", sets: [set("2026-11-b"), set("2026-11-c")] });
    const { fetchText } = fakeFetch(
      [release("v0.1.0", [1]), release("v0.1.0-alpha.11", [1]), release("v0.1.0-alpha.10", [1])],
      {
        "https://dl/v0.1.0-alpha.11/migrations.json": a,
        "https://dl/v0.1.0-alpha.11/migrations.json.sig": sign(a),
        "https://dl/v0.1.0/migrations.json": b,
        "https://dl/v0.1.0/migrations.json.sig": sign(b),
      },
    );
    const result = await fetchReleaseMigrations({
      from: "0.1.0-alpha.10",
      to: "0.1.0",
      publicKey,
      fetchText,
    });
    expect(result.ok).toBe(true);
    expect(result.sets.map((s) => s.id)).toEqual(["2026-10-a", "2026-11-b", "2026-11-c"]);
  });

  it("skips releases without migrations", async () => {
    const { fetchText } = fakeFetch([release("v0.1.0"), release("v0.1.0-alpha.11")], {});
    await expect(
      fetchReleaseMigrations({ from: "0.1.0-alpha.10", to: "0.1.0", publicKey, fetchText }),
    ).resolves.toEqual({ ok: true, sets: [] });
  });

  it("refuses a file whose signature does not match, and uses none of it", async () => {
    const a = JSON.stringify({ release: "0.1.0", sets: [set("2026-10-a")] });
    const { fetchText } = fakeFetch([release("v0.1.0", [1])], {
      "https://dl/v0.1.0/migrations.json": a,
      "https://dl/v0.1.0/migrations.json.sig": sign(a.replace("2026", "2027")),
    });
    const result = await fetchReleaseMigrations({
      from: "0.0.9",
      to: "0.1.0",
      publicKey,
      fetchText,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/signature/);
    expect(result.sets).toEqual([]);
  });

  it("reports being offline (the release list cannot be fetched)", async () => {
    const result = await fetchReleaseMigrations({
      from: "0.0.9",
      to: "0.1.0",
      publicKey,
      fetchText: async () => {
        throw new Error("getaddrinfo ENOTFOUND api.github.com");
      },
    });
    expect(result).toMatchObject({ ok: false, sets: [] });
    expect(result.error).toMatch(/ENOTFOUND/);
  });
});

describe("MIGRATIONS_PUBLIC_KEY", () => {
  it("is an ed25519 public key", async () => {
    const { MIGRATIONS_PUBLIC_KEY } =
      await import("@openp41ge/main/services/migrations/public-key");
    expect(crypto.createPublicKey(MIGRATIONS_PUBLIC_KEY).asymmetricKeyType).toBe("ed25519");
  });
});

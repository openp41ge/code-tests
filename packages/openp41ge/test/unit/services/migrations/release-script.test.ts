/**
 * scripts/release-migrations.mjs (the release pipeline): merges the sets for
 * a release into one signed migrations.json — what the app downloads.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync, spawnSync } from "child_process";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { verifySignature } from "@openp41ge/main/services/migrations/signature";
import { inApp } from "@app-tests/support";

/** This test's directory in the app checkout (it reads app files). */
const APP_HERE = inApp(__dirname);

const SCRIPT = path.resolve(APP_HERE, "../../../../scripts/release-migrations.mjs");
let dir: string;
let out: string;
const keys = crypto.generateKeyPairSync("ed25519");
const privatePem = keys.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const publicPem = keys.publicKey.export({ type: "spki", format: "pem" }).toString();

function writeSet(id: string, release: string): void {
  fs.writeFileSync(
    path.join(dir, `${id}.json`),
    JSON.stringify({ id, description: id, release, steps: [] }),
  );
}
const run = (
  version: string,
  env: Record<string, string> = { MIGRATIONS_SIGNING_KEY: privatePem },
) =>
  spawnSync(process.execPath, [SCRIPT, "--version", version, "--dir", dir, "--out", out], {
    env: { PATH: process.env.PATH ?? "", ...env },
    encoding: "utf-8",
  });

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "release-migrations-"));
  out = path.join(dir, "out");
  fs.mkdirSync(out);
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("release-migrations.mjs", () => {
  it("merges the release's sets into one file, signed", () => {
    writeSet("2026-11-b", "0.1.0-alpha.11");
    writeSet("2026-10-a", "0.1.0-alpha.11");
    writeSet("2026-09-old", "0.1.0-alpha.10");
    const result = run("v0.1.0-alpha.11");
    expect(result.status, result.stderr).toBe(0);
    const text = fs.readFileSync(path.join(out, "migrations.json"), "utf-8");
    const bundle = JSON.parse(text);
    expect(bundle.release).toBe("0.1.0-alpha.11");
    expect(bundle.sets.map((s: { id: string }) => s.id)).toEqual(["2026-10-a", "2026-11-b"]);
    const sig = fs.readFileSync(path.join(out, "migrations.json.sig"), "utf-8");
    expect(verifySignature(Buffer.from(text), sig, publicPem)).toBe(true);
  });

  it("writes nothing for a release without migrations", () => {
    writeSet("2026-09-old", "0.1.0-alpha.10");
    const result = run("0.1.0-alpha.11");
    expect(result.status).toBe(0);
    expect(fs.readdirSync(out)).toEqual([]);
  });

  it("fails without the signing key — a release never carries unsigned migrations", () => {
    writeSet("2026-10-a", "0.1.0-alpha.11");
    const result = run("0.1.0-alpha.11", {});
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/MIGRATIONS_SIGNING_KEY/);
    expect(fs.readdirSync(out)).toEqual([]);
  });

  it("fails on a set whose file name is not its id", () => {
    fs.writeFileSync(
      path.join(dir, "wrong-name.json"),
      JSON.stringify({ id: "2026-10-a", description: "x", release: "0.1.0", steps: [] }),
    );
    expect(run("0.1.0").status).not.toBe(0);
  });

  it("runs with plain node (no build step)", () => {
    expect(() => execFileSync(process.execPath, ["--check", SCRIPT])).not.toThrow();
  });
});

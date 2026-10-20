/**
 * The agents extension's config schema, as the settings form shows it: the
 * default provider is a menu of the providers' ids (`x-keysOf`), an API key
 * is masked, and every setting has a title.
 */
import { describe, it, expect } from "vitest";
import { validateConfigSchema, type ConfigSchema } from "openp41ge-sdk";
import { AGENTS_CONFIG_SCHEMA } from "@openp41ge-extension-agents/backend/config-schema";

const props = (s: ConfigSchema) => s.properties ?? {};
const provider = props(AGENTS_CONFIG_SCHEMA).providers.additionalProperties as ConfigSchema;

describe("the agents config schema", () => {
  it("is a valid config schema", () => {
    expect(() => validateConfigSchema(AGENTS_CONFIG_SCHEMA)).not.toThrow();
  });

  it("defaultProviderId names one of the providers", () => {
    expect(props(AGENTS_CONFIG_SCHEMA).defaultProviderId["x-keysOf"]).toBe("providers");
  });

  it("a provider's API key is a secret", () => {
    expect(props(provider).apiKey.secret).toBe(true);
  });

  it("a thinking level is a reasoning_effort string, null, or an object of request fields", () => {
    const model = props(provider).models.items as ConfigSchema;
    const level = props(model).thinking.additionalProperties as ConfigSchema;
    expect(level.type).toEqual(["string", "null", "object"]);
  });

  it("every setting has a title", () => {
    const untitled: string[] = [];
    const walk = (s: ConfigSchema, at: string) => {
      for (const [k, sub] of Object.entries(props(s))) {
        if (!sub.title) untitled.push(`${at}${k}`);
        walk(sub, `${at}${k}.`);
        if (sub.items) walk(sub.items, `${at}${k}[].`);
        if (typeof sub.additionalProperties === "object") walk(sub.additionalProperties, `${at}${k}.*.`);
      }
    };
    walk(AGENTS_CONFIG_SCHEMA, "");
    expect(untitled).toEqual([]);
  });

  it("descriptions are short: no headings or examples (the form shows the structure)", () => {
    const texts: string[] = [];
    const walk = (s: ConfigSchema) => {
      if (s.description) texts.push(s.description);
      for (const sub of Object.values(props(s))) walk(sub);
      if (s.items) walk(s.items);
      if (typeof s.additionalProperties === "object") walk(s.additionalProperties);
    };
    walk(AGENTS_CONFIG_SCHEMA);
    for (const t of texts) {
      expect(t).not.toMatch(/^#/m);
      expect(t).not.toContain("```");
    }
  });
});

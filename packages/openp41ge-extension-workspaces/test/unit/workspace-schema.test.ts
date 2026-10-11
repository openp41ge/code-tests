import { describe, it, expect } from "vitest";
import {
  WORKSPACE_EDITABLE_FIELDS,
  WORKSPACE_FILE_SCHEMA,
  editableView,
  mergeEditableFields,
} from "@openp41ge-extension-workspaces/workspace-schema";

describe("workspace editable schema", () => {
  it("describes only the user-editable manifest fields", () => {
    const props = Object.keys(WORKSPACE_FILE_SCHEMA.properties);
    expect(props.sort()).toEqual([...WORKSPACE_EDITABLE_FIELDS].sort());
    // Platform metadata + session state are never exposed as editable.
    for (const internal of ["id", "version", "createdAt", "dataDir", "windows"]) {
      expect(props).not.toContain(internal);
    }
  });

  it("editableView shows every editable field, filling empty defaults", () => {
    const view = editableView({ repos: [{ url: "git@example.com:a/b.git" }] });
    expect(Object.keys(view).sort()).toEqual([...WORKSPACE_EDITABLE_FIELDS].sort());
    expect((view as { name: string }).name).toBe("");
    expect((view as { repos: unknown[] }).repos).toHaveLength(1);
  });

  it("mergeEditableFields writes edited fields but skips untouched empty defaults", () => {
    const baseline = { repos: [] }; // file never authored a name
    const edited = { name: "", repos: [] }; // still the empty default the JSON showed
    const merged = mergeEditableFields(baseline, edited);
    // repos is authored, so written back; name was never authored and is still
    // at its default, so it is skipped.
    expect(merged).toEqual({ repos: [] });
    expect("name" in merged).toBe(false);
  });

  it("mergeEditableFields writes a field the user actively fills", () => {
    const baseline = { repos: [] };
    const edited = { name: "openp41ge", repos: [] };
    expect(mergeEditableFields(baseline, edited)).toEqual({ name: "openp41ge", repos: [] });
  });
});

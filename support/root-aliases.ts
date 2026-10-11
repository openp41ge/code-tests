/**
 * root-aliases.ts — the source aliases the app's old root vitest config gave
 * the packages that had no test config of their own (the UI toolkit, the
 * editor engine, syntax highlighting, the scrollbar).
 */

import path from "node:path";
import { APP_DIR } from "./app";

const src = (pkg: string, sub = "src") => path.join(APP_DIR, "packages", pkg, sub);

/** First matching key wins, so subpaths precede their package. */
export const ROOT_ALIASES: Record<string, string> = {
  "@openp41ge": src("openp41ge"),
  "@openp41ge-file-editor": src("openp41ge-sdk-uikit", "src/file-editor"),
  "@openp41ge-core-logger": src("openp41ge-core-logger"),
  "@openp41ge-core-terminal": src("openp41ge-core-terminal"),
  "openp41ge-core-tabs": src("openp41ge-core-tabs"),
  "openp41ge-core-editor-gutter": src("openp41ge-core-editor-gutter"),
  "openp41ge-core-editor-engine": src("openp41ge-core-editor-engine"),
  "openp41ge-file-editor": src("openp41ge-sdk-uikit", "src/file-editor"),
  "openp41ge-core-git": src("openp41ge-core-git"),
  "openp41ge-core-syntax-highlighting": src("openp41ge-core-syntax-highlighting"),
  "openp41ge-sdk-uikit/tooltip": src("openp41ge-sdk-uikit", "src/components/tooltip"),
  "openp41ge-sdk-uikit/drop-indicator": src("openp41ge-sdk-uikit", "src/components/drop-indicator"),
  "openp41ge-sdk-uikit/file-editor": src("openp41ge-sdk-uikit", "src/file-editor"),
  "openp41ge-sdk-uikit/git-repository": src("openp41ge-sdk-uikit", "src/git-repository"),
  "openp41ge-sdk-uikit/theme": src("openp41ge-sdk-uikit", "src/theme"),
  "openp41ge-sdk-uikit": src("openp41ge-sdk-uikit"),
  "openp41ge-core-scrollbar": src("openp41ge-core-scrollbar"),
  "openp41ge-core-filesystem": src("openp41ge-core-filesystem"),
  "openp41ge-core-constants": src("openp41ge-core-constants"),
  "openp41ge-core-logger": src("openp41ge-core-logger"),
  "openp41ge-core-terminal": src("openp41ge-core-terminal"),
};

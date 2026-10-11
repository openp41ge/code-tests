/** Stand-in for `openp41ge-sdk-uikit` in node-env tests. */
export class OverlayScrollbar {
  static attach(): OverlayScrollbar {
    return new OverlayScrollbar();
  }
  destroy(): void {}
}

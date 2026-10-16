/**
 * Test-only stand-in for the host's extension scope
 * (`openp41ge-core-extension-host/scope`). The SDK cannot depend on the host
 * (the host depends on the SDK), so its tests open/read the scope directly via
 * the shared global symbol — the SDK side of the cross-package contract. The
 * host's own tests cover the round trip from the other side.
 */
import type {
  ConfigSchema,
  DragDecls,
  HandlerFn,
  OpenKindDef,
  SearchProvider,
  SurfaceSpec,
} from "@openp41ge-sdk";

interface Scope {
  id: string;
  version: string;
  processes: Map<string, HandlerFn>;
  renderers: SurfaceSpec[];
  drag: { kinds: unknown[]; sources: unknown[]; consumers: unknown[]; dropTargets: unknown[] };
  open: { kinds: OpenKindDef[] };
  searchProviders: SearchProvider[];
  config: ConfigSchema | null;
  disposers: Array<() => void | Promise<void>>;
}

const KEY = Symbol.for("openp41ge.extension-scope");
const store = globalThis as Record<symbol, unknown>;
const current = () => (store[KEY] as Scope | null) ?? null;

export function beginExtensionScope(id: string, version: string): void {
  if (current())
    throw new Error(`beginExtensionScope called while scope '${current()!.id}' is open`);
  store[KEY] = {
    id,
    version,
    processes: new Map(),
    renderers: [],
    drag: { kinds: [], sources: [], consumers: [], dropTargets: [] },
    open: { kinds: [] },
    searchProviders: [],
    config: null,
    disposers: [],
  };
}

export function endExtensionScope(): void {
  store[KEY] = null;
}

export function getScopedProcesses(): ReadonlyMap<string, HandlerFn> | null {
  return current()?.processes ?? null;
}

export function getScopedRenderers(): readonly SurfaceSpec[] | null {
  const s = current();
  return s ? [...s.renderers] : null;
}

export function getScopedDragDecls(): DragDecls | null {
  const s = current();
  if (!s) return null;
  return {
    kinds: [...s.drag.kinds],
    sources: [...s.drag.sources],
    consumers: [...s.drag.consumers],
    dropTargets: [...s.drag.dropTargets],
  } as DragDecls;
}

export function getScopedConfigSchema(): ConfigSchema | null {
  return current()?.config ?? null;
}

export function getScopedDisposers(): ReadonlyArray<() => void | Promise<void>> | null {
  const s = current();
  return s ? [...s.disposers] : null;
}

export function getScopedOpenKinds(): readonly OpenKindDef[] | null {
  const s = current();
  return s ? [...s.open.kinds] : null;
}

export function getScopedSearchProviders(): readonly SearchProvider[] | null {
  const s = current();
  return s ? [...s.searchProviders] : null;
}

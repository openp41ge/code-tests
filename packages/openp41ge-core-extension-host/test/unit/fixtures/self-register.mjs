import { registerProcesses } from "openp41ge-sdk";
globalThis.__selfRegCount = (globalThis.__selfRegCount || 0) + 1;
const n = globalThis.__selfRegCount;
registerProcesses({
  "ping": async () => ({ ok: true }),
  [`ping${n}`]: async () => ({ ok: true, n }),
});

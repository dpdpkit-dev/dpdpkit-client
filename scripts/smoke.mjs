// Load the built package through both module systems (CI runs this on the oldest supported Node).
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const expected = { index: ["DpdpClient", "DpdpError", "createDpdpClient"], express: ["requireConsent"] };
for (const [entry, names] of Object.entries(expected)) {
  const cjs = require(`../dist/${entry}.cjs`);
  const esm = await import(`../dist/${entry}.js`);
  for (const name of names) {
    if (typeof cjs[name] !== "function" || typeof esm[name] !== "function") {
      throw new Error(`dist/${entry}: ${name} missing`);
    }
  }
}
const client = require("../dist/index.cjs").createDpdpClient({ baseUrl: "https://example.invalid/dpdp" });
if (typeof client !== "object") throw new Error("createDpdpClient did not return a client");
console.log(`ok: dist loads on Node ${process.versions.node} (CJS and ESM)`);

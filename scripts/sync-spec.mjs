// Copy openapi.yaml from dpdpkit-spec at a tag (default: main) so types can be regenerated.
// Usage: node scripts/sync-spec.mjs [ref]
import { writeFile } from "node:fs/promises";

const ref = process.argv[2] ?? "main";
const url = `https://raw.githubusercontent.com/dpdpkit-dev/dpdpkit-spec/${ref}/openapi.yaml`;
const res = await fetch(url);
if (!res.ok) throw new Error(`fetch ${url}: ${res.status}`);
await writeFile(new URL("../spec/openapi.yaml", import.meta.url), await res.text());
console.log(`spec/openapi.yaml synced from dpdpkit-spec@${ref}`);

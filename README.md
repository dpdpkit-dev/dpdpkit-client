# @dpdpkit/client

Typed TypeScript client for the [dpdpkit](https://github.com/dpdpkit-dev) REST contract. It works in browsers
and Node 18+. Types are generated from [`openapi.yaml`](https://github.com/dpdpkit-dev/dpdpkit-spec), so the
client always matches what the FastAPI adapter, the Django adapter and `dpdpkit-server` expose.

> **Disclaimer.** dpdpkit is software that helps you implement obligations under India's Digital Personal
> Data Protection Act, 2023 and the DPDP Rules, 2025. It does not provide legal advice and does not
> guarantee compliance.

```bash
npm i @dpdpkit/client
```

## Browser

```ts
import { createDpdpClient, DpdpError } from "@dpdpkit/client";

const dpdp = createDpdpClient({ baseUrl: "/dpdp" });          // same-origin; cookies sent

const notice = await dpdp.getNotice("hi");
await dpdp.recordConsents([{ purpose: "marketing", granted: true }], { noticeVersion: notice.version });
await dpdp.withdraw("marketing");
const request = await dpdp.openRequest("erasure");
console.log(request.due_at);

try {
  await dpdp.withdraw("marketing");
} catch (err) {
  if (err instanceof DpdpError && err.code === "invalid_transition") { /* already withdrawn */ }
}
```

## Node / Express with dpdpkit-server

```ts
import { requireConsent } from "@dpdpkit/client/express";

const consent = (purpose: string) =>
  requireConsent(purpose, {
    baseUrl: "http://dpdpkit:8000/dpdp",
    principal: (req) => req.user?.id,
    serviceHeaders: (principal) => ({ Authorization: `Bearer ${process.env.DPDPKIT_API_KEY}`, "X-DPDP-Principal": principal }),
  });

app.post("/offers/send", consent("marketing"), sendOffer);   // 403 consent_required if not granted
```

The middleware fails closed: if dpdpkit cannot be reached, it calls `next(err)` and never lets the
request through.

## Admin

```ts
const queue = await dpdp.admin.listRequests({ open: true });
await dpdp.admin.updateRequest(queue[0].id, { action: "respond", message: "Done." });
const check = await dpdp.admin.verifyLedger();          // { ok, failed_row, ... }
```

## Development

```bash
npm ci
npm run sync-spec -- v0.1.0    # copy openapi.yaml from dpdpkit-spec at a tag
npm run generate               # regenerate src/schema.ts (CI fails if it drifts)
npm test && npm run build
```

## Licence

Apache-2.0.

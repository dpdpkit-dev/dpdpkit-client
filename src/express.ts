/**
 * Express (and Connect-compatible) middleware for Node backends that run dpdpkit-server.
 *
 * No dependency on Express: the request/response types are structural.
 */
import { DpdpClient, DpdpError, type ClientOptions } from "./client.js";

interface MinimalRequest {
  headers: Record<string, string | string[] | undefined>;
}

interface MinimalResponse {
  status(code: number): MinimalResponse;
  json(body: unknown): unknown;
}

type Next = (err?: unknown) => void;

export interface RequireConsentOptions extends Omit<ClientOptions, "headers"> {
  /** Maps the incoming request to the principal reference your backend registered with dpdpkit. */
  principal: (req: MinimalRequest) => string | undefined | Promise<string | undefined>;
  /**
   * Headers that authenticate your backend to dpdpkit-server for this principal (for example an API key
   * plus the principal header the server accepts from service callers).
   */
  serviceHeaders: (principal: string) => Record<string, string> | Promise<Record<string, string>>;
  /** Cache a positive or negative answer for this many milliseconds (default 0: always ask). */
  cacheMs?: number;
}

/**
 * `app.post("/offers/send", requireConsent("marketing", options), handler)`
 *
 * Responds 401 when no principal is resolved and 403 `consent_required` when consent is missing.
 * Errors reaching dpdpkit are passed to `next(err)` so your error handler decides; the middleware
 * never allows a request through because dpdpkit could not be reached.
 */
export function requireConsent(purpose: string, options: RequireConsentOptions) {
  const cache = new Map<string, { allowed: boolean; until: number }>();
  const ttl = options.cacheMs ?? 0;

  return async function dpdpRequireConsent(req: MinimalRequest, res: MinimalResponse, next: Next): Promise<void> {
    let principal: string | undefined;
    try {
      principal = await options.principal(req);
    } catch (err) {
      next(err);
      return;
    }
    if (!principal) {
      res.status(401).json({ error: { code: "unauthenticated", message: "sign in to continue", details: {} } });
      return;
    }
    const key = `${principal}\u0000${purpose}`;
    const hit = cache.get(key);
    let allowed: boolean;
    if (hit && hit.until > Date.now()) {
      allowed = hit.allowed;
    } else {
      const headers = await options.serviceHeaders(principal);
      const client = new DpdpClient({ ...options, headers });
      try {
        const consents = await client.myConsents();
        allowed = consents.some((c) => c.purpose === purpose && c.status === "granted");
      } catch (err) {
        next(err instanceof DpdpError ? err : new DpdpError(502, "dpdpkit_unreachable", String(err)));
        return;
      }
      if (ttl > 0) cache.set(key, { allowed, until: Date.now() + ttl });
    }
    if (!allowed) {
      res.status(403).json({
        error: { code: "consent_required", message: `consent required for purpose '${purpose}'`, details: { purpose } },
      });
      return;
    }
    next();
  };
}

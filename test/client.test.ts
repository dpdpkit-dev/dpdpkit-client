import { describe, expect, it, vi } from "vitest";
import { createDpdpClient, DpdpError } from "../src/index.js";
import { requireConsent } from "../src/express.js";

type Call = { url: string; init: RequestInit };

function mockFetch(responses: Array<{ status?: number; body: unknown }>) {
  const calls: Call[] = [];
  const fn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const next = responses.shift() ?? { status: 500, body: {} };
    return new Response(JSON.stringify(next.body), {
      status: next.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  });
  return { fetch: fn as unknown as typeof fetch, calls };
}

const state = { purpose: "marketing", status: "granted", notice_version: 1, updated_at: "2027-01-01T00:00:00Z", event_id: "e1" };

describe("DpdpClient", () => {
  it("builds URLs with the mount prefix and query params", async () => {
    const { fetch, calls } = mockFetch([{ body: { version: 1 } }]);
    const client = createDpdpClient({ baseUrl: "https://api.example.in/dpdp/", fetch });
    await client.getNotice("hi");
    expect(calls[0]!.url).toBe("https://api.example.in/dpdp/notices/current?locale=hi");
  });

  it("supports relative base URLs for same-origin browser use", async () => {
    const { fetch, calls } = mockFetch([{ body: { consents: [] } }]);
    await createDpdpClient({ baseUrl: "/dpdp", fetch }).myConsents();
    expect(calls[0]!.url).toBe("/dpdp/consents/me");
    expect(calls[0]!.init.credentials).toBe("same-origin");
  });

  it("sends decisions as JSON with fresh headers", async () => {
    const { fetch, calls } = mockFetch([{ status: 201, body: { consents: [state] } }]);
    let n = 0;
    const client = createDpdpClient({ baseUrl: "/dpdp", fetch, headers: () => ({ "X-Token": String(++n) }) });
    const result = await client.recordConsents([{ purpose: "marketing", granted: true }], { noticeVersion: 1 });
    expect(result).toEqual([state]);
    const init = calls[0]!.init;
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["X-Token"]).toBe("1");
    expect(JSON.parse(String(init.body))).toEqual({ decisions: [{ purpose: "marketing", granted: true }], notice_version: 1 });
  });

  it("raises DpdpError with the contract error code", async () => {
    const { fetch } = mockFetch([
      { status: 409, body: { error: { code: "invalid_transition", message: "no active consent", details: { purpose: "m" } } } },
    ]);
    const err = await createDpdpClient({ baseUrl: "/dpdp", fetch }).withdraw("m").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DpdpError);
    expect((err as DpdpError).status).toBe(409);
    expect((err as DpdpError).code).toBe("invalid_transition");
    expect((err as DpdpError).details).toEqual({ purpose: "m" });
  });

  it("encodes path parameters and calls admin endpoints", async () => {
    const { fetch, calls } = mockFetch([{ body: { id: "a/b" } }, { body: { items: [] } }]);
    const client = createDpdpClient({ baseUrl: "/dpdp", fetch });
    await client.admin.updateRequest("a/b", { action: "start" });
    await client.admin.listRequests({ open: true });
    expect(calls[0]!.url).toBe("/dpdp/admin/requests/a%2Fb");
    expect(calls[0]!.init.method).toBe("PATCH");
    expect(calls[1]!.url).toBe("/dpdp/admin/requests?open=true");
  });
});

describe("requireConsent (express)", () => {
  function res() {
    const out = { code: 0, body: undefined as unknown };
    const r = {
      status(code: number) {
        out.code = code;
        return r;
      },
      json(body: unknown) {
        out.body = body;
        return body;
      },
    };
    return { r, out };
  }

  const base = { baseUrl: "https://dpdp.internal/dpdp", serviceHeaders: (p: string) => ({ "X-DPDP-Principal": p }) };

  it("allows a granted purpose", async () => {
    const { fetch, calls } = mockFetch([{ body: { consents: [state] } }]);
    const mw = requireConsent("marketing", { ...base, fetch, principal: () => "u1" });
    const next = vi.fn();
    const { r } = res();
    await mw({ headers: {} }, r, next);
    expect(next).toHaveBeenCalledWith();
    expect((calls[0]!.init.headers as Record<string, string>)["X-DPDP-Principal"]).toBe("u1");
  });

  it("returns 403 consent_required when not granted, 401 without principal", async () => {
    const { fetch } = mockFetch([{ body: { consents: [{ ...state, status: "withdrawn" }] } }]);
    const mw = requireConsent("marketing", { ...base, fetch, principal: () => "u1" });
    const { r, out } = res();
    await mw({ headers: {} }, r, vi.fn());
    expect(out.code).toBe(403);
    expect((out.body as { error: { code: string } }).error.code).toBe("consent_required");

    const anon = res();
    await requireConsent("marketing", { ...base, fetch, principal: () => undefined })({ headers: {} }, anon.r, vi.fn());
    expect(anon.out.code).toBe(401);
  });

  it("fails closed when dpdpkit is unreachable", async () => {
    const fetch = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof globalThis.fetch;
    const next = vi.fn();
    const { r, out } = res();
    await requireConsent("marketing", { ...base, fetch, principal: () => "u1" })({ headers: {} }, r, next);
    expect(next).toHaveBeenCalledOnce();
    expect(next.mock.calls[0]![0]).toBeInstanceOf(DpdpError);
    expect(out.code).toBe(0);
  });
});

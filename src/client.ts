import type { components } from "./schema.js";

type Schemas = components["schemas"];

export type Notice = Schemas["Notice"];
export type NoticePurpose = Schemas["NoticePurpose"];
export type ConsentState = Schemas["ConsentState"];
export type ConsentStatus = Schemas["ConsentStatus"];
export type ConsentList = Schemas["ConsentList"];
export type ConsentReceipt = Schemas["ConsentReceipt"];
export type ConsentDecisionRequest = Schemas["ConsentDecisionRequest"];
export type RequestKind = Schemas["RequestKind"];
export type RequestStatus = Schemas["RequestStatus"];
export type RightsRequest = Schemas["RightsRequest"];
export type AdminRightsRequest = Schemas["AdminRightsRequest"];
export type AdminRequestUpdate = Schemas["AdminRequestUpdate"];
export type RetentionPreview = Schemas["RetentionPreview"];
export type LedgerVerification = Schemas["LedgerVerification"];
export type PrincipalExport = Schemas["PrincipalExport"];
export type ErrorBody = Schemas["Error"];

type HeaderSource = Record<string, string> | (() => Record<string, string> | Promise<Record<string, string>>);

export interface ClientOptions {
  /** Base URL including the mount prefix, e.g. `https://api.example.in/dpdp` or `/dpdp`. */
  baseUrl: string;
  /** Extra headers per request (auth token, CSRF token…). May be a function for fresh values. */
  headers?: HeaderSource;
  /** `include` to send cookies cross-origin. Defaults to `same-origin`. */
  credentials?: RequestCredentials;
  /** Custom fetch (tests, Node < 18 polyfills). */
  fetch?: typeof fetch;
}

/** A non-2xx response from dpdpkit, carrying the contract's stable error code. */
export class DpdpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: Record<string, unknown>;

  constructor(status: number, code: string, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "DpdpError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export interface Decision {
  purpose: string;
  granted: boolean;
}

export class DpdpClient {
  private readonly baseUrl: string;
  private readonly options: ClientOptions;
  private readonly fetchImpl: typeof fetch;

  constructor(options: ClientOptions) {
    this.options = options;
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  private async headers(extra?: Record<string, string>): Promise<Record<string, string>> {
    const source = this.options.headers;
    const base = typeof source === "function" ? await source() : (source ?? {});
    return { Accept: "application/json", ...base, ...extra };
  }

  private async send(method: string, path: string, init: { body?: unknown; query?: Record<string, unknown>; headers?: Record<string, string> } = {}): Promise<Response> {
    const url = new URL(this.baseUrl + path, "http://placeholder");
    for (const [key, value] of Object.entries(init.query ?? {})) {
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    }
    const target = /^https?:\/\//.test(this.baseUrl) ? url.toString() : url.pathname + url.search;
    const headers = await this.headers(init.headers);
    if (init.body !== undefined) headers["Content-Type"] = "application/json";
    const response = await this.fetchImpl(target, {
      method,
      headers,
      credentials: this.options.credentials ?? "same-origin",
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    if (!response.ok) {
      let code = "http_error";
      let message = `${method} ${path} failed with ${response.status}`;
      let details: Record<string, unknown> = {};
      try {
        const body = (await response.json()) as Partial<ErrorBody>;
        if (body.error) {
          code = body.error.code;
          message = body.error.message;
          details = (body.error.details as Record<string, unknown> | undefined) ?? {};
        }
      } catch {
        /* non-JSON error body */
      }
      throw new DpdpError(response.status, code, message, details);
    }
    return response;
  }

  private async json<T>(method: string, path: string, init?: Parameters<DpdpClient["send"]>[2]): Promise<T> {
    return (await (await this.send(method, path, init)).json()) as T;
  }

  // ------------------------------------------------------------------ notices

  getNotice(locale?: string): Promise<Notice> {
    return this.json("GET", "/notices/current", { query: { locale } });
  }

  // ------------------------------------------------------------------ consents

  async recordConsents(decisions: Decision[], options: { noticeVersion?: number; locale?: string } = {}): Promise<ConsentState[]> {
    const body: ConsentDecisionRequest = { decisions, notice_version: options.noticeVersion, locale: options.locale };
    return (await this.json<ConsentList>("POST", "/consents", { body })).consents;
  }

  withdraw(purpose: string): Promise<ConsentState> {
    return this.json("POST", `/consents/${encodeURIComponent(purpose)}/withdraw`);
  }

  async myConsents(): Promise<ConsentState[]> {
    return (await this.json<ConsentList>("GET", "/consents/me")).consents;
  }

  receipt(): Promise<ConsentReceipt> {
    return this.json("GET", "/consents/me/receipt");
  }

  // ------------------------------------------------------------------ rights requests

  openRequest(kind: RequestKind, details: Record<string, unknown> = {}): Promise<RightsRequest> {
    return this.json("POST", "/requests", { body: { kind, details } });
  }

  async myRequests(): Promise<RightsRequest[]> {
    return (await this.json<{ items: RightsRequest[] }>("GET", "/requests")).items;
  }

  getRequest(id: string): Promise<RightsRequest> {
    return this.json("GET", `/requests/${encodeURIComponent(id)}`);
  }

  exportMyData(): Promise<PrincipalExport> {
    return this.json("GET", "/me/export");
  }

  async exportMyDataHtml(): Promise<string> {
    return (await this.send("GET", "/me/export", { query: { format: "html" }, headers: { Accept: "text/html" } })).text();
  }

  // ------------------------------------------------------------------ admin

  readonly admin = {
    listRequests: async (params: { status?: RequestStatus; open?: boolean } = {}): Promise<AdminRightsRequest[]> =>
      (await this.json<{ items: AdminRightsRequest[] }>("GET", "/admin/requests", { query: params })).items,
    getRequest: (id: string): Promise<AdminRightsRequest> => this.json("GET", `/admin/requests/${encodeURIComponent(id)}`),
    updateRequest: (id: string, update: AdminRequestUpdate): Promise<AdminRightsRequest> =>
      this.json("PATCH", `/admin/requests/${encodeURIComponent(id)}`, { body: update }),
    retentionPreview: (hours = 168): Promise<RetentionPreview> => this.json("GET", "/admin/retention/preview", { query: { hours } }),
    verifyLedger: (): Promise<LedgerVerification> => this.json("POST", "/admin/ledger/verify"),
    auditExport: async (): Promise<Blob> => (await this.send("GET", "/admin/audit/export", { headers: { Accept: "application/zip" } })).blob(),
  };

  // ------------------------------------------------------------------ events

  async recordActivity(principal: string, at?: Date): Promise<void> {
    await this.send("POST", "/events/activity", { body: { principal, at: at?.toISOString() } });
  }
}

export function createDpdpClient(options: ClientOptions): DpdpClient {
  return new DpdpClient(options);
}

// -----------------------------------------------------------------------------
// Client of the Pangolin Integration API (https://docs.pangolin.net).
//
// One base URL (`.../v1`), one organization API key sent as a Bearer token.
// Every answer is wrapped by Pangolin in `{ data, success, error, message,
// status }`: the client unwraps `data` and turns everything else into a
// PangolinApiError carrying the HTTP status, so the callers can tell a wrong
// key (401), a key without the right permission (403) and an unknown
// organization (404) apart from a server that does not answer at all.
//
// Only what the integration needs is wrapped: read the organization, its sites
// and its public resources, and enable or disable a resource.
// -----------------------------------------------------------------------------

/** Above this, a request is abandoned: a refresh must never pile up. */
export const REQUEST_TIMEOUT_MS = 10_000;

/** Items per page of the list endpoints (Pangolin defaults to 20). */
export const PAGE_SIZE = 100;

/** Safety stop of the pagination loop: 100 pages of 100 is far beyond a home. */
const MAX_PAGES = 100;

/** The API answered, with an error status. */
export class PangolinApiError extends Error {
  /**
   * @param {number} status HTTP status
   * @param {string} message Pangolin's own message, when it gave one
   */
  constructor(status, message) {
    super(message || `HTTP ${status}`);
    this.name = 'PangolinApiError';
    this.status = status;
  }
}

/** The API did not answer: DNS, refused connection, TLS, timeout. */
export class PangolinUnreachableError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = 'PangolinUnreachableError';
  }
}

export class PangolinClient {
  /**
   * @param {object} options
   * @param {string} options.baseUrl normalized Integration API URL, ending in /v1
   * @param {string} options.apiKey organization key `<id>.<secret>`
   * @param {typeof fetch} [options.fetch] injected in the tests
   * @param {number} [options.timeoutMs]
   */
  constructor({ baseUrl, apiKey, fetch: fetchImpl = globalThis.fetch, timeoutMs }) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
    this.fetch = fetchImpl;
    this.timeoutMs = timeoutMs ?? REQUEST_TIMEOUT_MS;
  }

  /**
   * One request, unwrapped.
   * @param {string} method
   * @param {string} path relative to the base URL, starting with '/'
   * @param {object} [body]
   */
  async request(method, path, body) {
    let response;
    try {
      response = await this.fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      // The cause (ECONNREFUSED, ENOTFOUND, a TLS error...) is what the user
      // needs to read, not undici's generic "fetch failed".
      const reason =
        err?.name === 'TimeoutError'
          ? `no answer within ${Math.round(this.timeoutMs / 1000)} s`
          : (err?.cause?.code ?? err?.cause?.message ?? err?.message ?? 'network error');
      throw new PangolinUnreachableError(`${this.baseUrl} unreachable: ${reason}`, { cause: err });
    }

    let payload = null;
    try {
      payload = await response.json();
    } catch {
      // A reverse proxy error page, an empty body: the status says enough.
    }
    if (!response.ok || payload?.success === false) {
      throw new PangolinApiError(
        response.ok ? (payload?.status ?? 500) : response.status,
        typeof payload?.message === 'string' ? payload.message : '',
      );
    }
    if (!payload || typeof payload !== 'object') {
      // Something answered 200 without JSON: not a Pangolin API (a dashboard
      // URL pasted instead of the API one, a captive portal...).
      throw new PangolinApiError(response.status, 'the answer is not the Pangolin API');
    }
    return payload.data;
  }

  /**
   * Every item of a paginated list endpoint.
   * @param {string} path
   * @param {string} field the array of `data` holding the items (`sites`...)
   */
  async listAll(path, field) {
    const items = [];
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const separator = path.includes('?') ? '&' : '?';
      const data = await this.request(
        'GET',
        `${path}${separator}pageSize=${PAGE_SIZE}&page=${page}`,
      );
      const batch = Array.isArray(data?.[field]) ? data[field] : [];
      items.push(...batch);
      const total = Number(data?.pagination?.total);
      if (batch.length < PAGE_SIZE || (Number.isFinite(total) && items.length >= total)) {
        break;
      }
    }
    return items;
  }

  /** The organization, `{ orgId, name, ... }`: checks the key and the orgId. */
  getOrg(orgId) {
    return this.request('GET', `/org/${encodeURIComponent(orgId)}`).then(
      (data) => data?.org ?? data,
    );
  }

  /** The sites (Newt tunnels, WireGuard sites, local sites) of the organization. */
  listSites(orgId) {
    return this.listAll(`/org/${encodeURIComponent(orgId)}/sites`, 'sites');
  }

  /** The public resources (HTTP, TCP, UDP) of the organization, with their targets. */
  listResources(orgId) {
    return this.listAll(`/org/${encodeURIComponent(orgId)}/resources`, 'resources');
  }

  /** Enable or disable a public resource. */
  setResourceEnabled(resourceId, enabled) {
    return this.request('POST', `/resource/${encodeURIComponent(resourceId)}`, {
      enabled: Boolean(enabled),
    });
  }
}

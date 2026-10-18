// -----------------------------------------------------------------------------
// In-memory Pangolin Integration API, served through an injected `fetch`.
//
// It answers the endpoints the integration calls, in the `{ data, success,
// error, message, status }` envelope Pangolin uses, with pagination, and checks
// the Bearer key. Each base URL can be made unreachable or made to answer an
// error status, to drive the local / cloud fallback. No network involved.
// -----------------------------------------------------------------------------

export const API_KEY = 'key123.s3cr3t';
export const ORG_ID = 'home';
export const LOCAL_URL = 'http://192.168.1.10:3004/v1';
export const CLOUD_URL = 'https://api.pangolin.net/v1';

export function sampleSites() {
  return [
    {
      siteId: 1,
      niceId: 'house',
      name: 'House',
      type: 'newt',
      online: true,
      megabytesIn: 12.3456,
      megabytesOut: 1.5,
    },
    {
      siteId: 2,
      niceId: 'cabin',
      name: 'Cabin',
      type: 'wireguard',
      online: false,
      megabytesIn: 0,
      megabytesOut: 0,
    },
    {
      siteId: 3,
      niceId: 'host',
      name: 'Pangolin host',
      type: 'local',
      megabytesIn: 3,
      megabytesOut: 4,
    },
  ];
}

export function sampleResources() {
  return [
    {
      resourceId: 10,
      niceId: 'nas',
      name: 'NAS',
      fullDomain: 'nas.example.com',
      enabled: true,
      health: 'healthy',
    },
    {
      resourceId: 11,
      niceId: 'cam',
      name: 'Cameras',
      fullDomain: 'cam.example.com',
      enabled: true,
      health: 'unknown',
    },
    {
      resourceId: 12,
      niceId: 'ssh',
      name: 'SSH',
      fullDomain: null,
      proxyPort: 2222,
      enabled: false,
      health: 'unhealthy',
    },
  ];
}

// Every answer is a fresh copy, like a body decoded from the wire: the tests
// mutate `sites` / `resources` in place between two reads.
const envelope = (status, data, message = '') => ({
  status,
  json: async () =>
    structuredClone({ data, success: status < 400, error: status >= 400, message, status }),
  ok: status < 400,
});

export function createFakePangolin({ sites = sampleSites(), resources = sampleResources() } = {}) {
  const pangolin = {
    org: { orgId: ORG_ID, name: 'Home' },
    sites,
    resources,
    requests: [],
    // base URL -> 'unreachable' | HTTP status to answer with
    failures: new Map(),

    fetch: async (url, init = {}) => {
      const { method = 'GET', headers = {}, body } = init;
      const base = [LOCAL_URL, CLOUD_URL].find((candidate) => url.startsWith(candidate));
      pangolin.requests.push({ url, method, body: body ? JSON.parse(body) : undefined });
      const failure = pangolin.failures.get(base);
      if (failure === 'unreachable' || base === undefined) {
        throw new TypeError('fetch failed', { cause: { code: 'ECONNREFUSED' } });
      }
      if (typeof failure === 'number') {
        return envelope(failure, null, 'failure injected by the test');
      }
      if (headers.Authorization !== `Bearer ${API_KEY}`) {
        return envelope(401, null, 'Invalid API key');
      }
      const { pathname, searchParams } = new URL(url.slice(base.length), 'http://x');
      const page = Number(searchParams.get('page') ?? 1);
      const pageSize = Number(searchParams.get('pageSize') ?? 20);
      const paginate = (field, items) =>
        envelope(200, {
          [field]: items.slice((page - 1) * pageSize, page * pageSize),
          pagination: { total: items.length, pageSize, page },
        });

      if (method === 'GET' && pathname === `/org/${ORG_ID}`) {
        return envelope(200, { org: pangolin.org });
      }
      if (method === 'GET' && pathname === `/org/${ORG_ID}/sites`) {
        return paginate('sites', pangolin.sites);
      }
      if (method === 'GET' && pathname === `/org/${ORG_ID}/resources`) {
        return paginate('resources', pangolin.resources);
      }
      const update = /^\/resource\/(\d+)$/.exec(pathname);
      if (method === 'POST' && update) {
        const item = pangolin.resources.find((r) => r.resourceId === Number(update[1]));
        if (!item) {
          return envelope(404, null, 'Resource not found');
        }
        Object.assign(item, JSON.parse(body));
        return envelope(200, { ...item });
      }
      if (pathname.startsWith('/org/')) {
        return envelope(404, null, 'Organization not found');
      }
      return envelope(404, null, 'Not found');
    },
  };
  return pangolin;
}

/** A complete configuration pointing at the fake. */
export function fakeConfig(overrides = {}) {
  return { local_url: LOCAL_URL, api_key: API_KEY, org_id: ORG_ID, ...overrides };
}

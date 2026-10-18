// -----------------------------------------------------------------------------
// Integration configuration.
//
// The configuration is filled in by the user in Gladys, from the `config_schema`
// declared in `gladys-assistant-integration.json`. The SDK fetches it
// (`gladys.getConfig()`) and notifies every change (`gladys.onConfigUpdated()`).
//
// This module provides the defaults and normalizes the received object, so the
// rest of the code never has to deal with `undefined`, stray spaces or a URL
// pasted with or without its `/v1`.
// -----------------------------------------------------------------------------

// Defaults: they MUST stay consistent with the `default` values declared in the
// `config_schema` of the manifest (test/manifest.test.js checks it).
export const DEFAULT_CONFIG = {
  // Integration API of a Pangolin server reached on the LAN (the "local"
  // transport), e.g. http://192.168.1.10:3004/v1. Empty: no local channel.
  local_url: '',
  // Integration API reached over the Internet (the "cloud" transport): Pangolin
  // Cloud (https://api.pangolin.net/v1) or the public address of a self-hosted
  // server. Empty: no cloud channel.
  cloud_url: '',
  // Organization key `<id>.<secret>`, sent as a Bearer token. A secret: never
  // logged, never returned in a message.
  api_key: '',
  // Organization the key belongs to (the `orgId` of every API path).
  org_id: '',
  // Seconds between two reads of the Pangolin API.
  poll_frequency: 60,
  // Reserved key (NOT in config_schema): the manifest declares both 'local'
  // and 'cloud' in its `transports` field, so Gladys shows a standard "Prefer
  // the local connection" toggle and sends the user's choice here. Read-only
  // for the integration; defaults to true.
  GLADYS_PREFER_LOCAL: true,
};

// Bounds of the refresh interval, in seconds, the same as the manifest field.
export const POLL_FREQUENCY_MIN = 30;
export const POLL_FREQUENCY_MAX = 3600;

/**
 * A base URL of the Pangolin Integration API, or '' when the field is empty or
 * not an http(s) URL. The API lives under `/v1`: a URL pasted without it gets
 * it, so `https://api.example.com` and `https://api.example.com/v1/` both mean
 * `https://api.example.com/v1`.
 * @param {unknown} raw value typed in the configuration screen
 * @returns {string}
 */
export function normalizeApiUrl(raw) {
  const text = String(raw ?? '').trim();
  if (!text) {
    return '';
  }
  let url;
  try {
    url = new URL(text);
  } catch {
    return '';
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return '';
  }
  // Credentials in a URL would end up in the logs: the key has its own field.
  url.username = '';
  url.password = '';
  url.search = '';
  url.hash = '';
  let path = url.pathname.replace(/\/+$/, '');
  if (!/\/v1$/.test(path)) {
    path = `${path}/v1`;
  }
  url.pathname = path;
  return url.toString().replace(/\/+$/, '');
}

/**
 * Merge the user config with the defaults.
 * @param {Record<string, unknown>} raw config returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const pollFrequency = Number(raw.poll_frequency ?? DEFAULT_CONFIG.poll_frequency);
  return {
    ...DEFAULT_CONFIG,
    ...raw,
    local_url: normalizeApiUrl(raw.local_url),
    cloud_url: normalizeApiUrl(raw.cloud_url),
    api_key: String(raw.api_key ?? '').trim(),
    org_id: String(raw.org_id ?? '').trim(),
    // Forced into the manifest bounds: a form can send anything, and a 0 here
    // would hammer the API.
    poll_frequency: Number.isFinite(pollFrequency)
      ? Math.min(POLL_FREQUENCY_MAX, Math.max(POLL_FREQUENCY_MIN, Math.round(pollFrequency)))
      : DEFAULT_CONFIG.poll_frequency,
    // The preference is a boolean; anything but an explicit false means true.
    GLADYS_PREFER_LOCAL: raw.GLADYS_PREFER_LOCAL !== false,
  };
}

/**
 * What is still missing before the integration can call the API, as the keys
 * of the missing fields. Empty when the configuration is complete.
 * @param {ReturnType<typeof normalizeConfig>} config
 * @returns {string[]}
 */
export function missingSettings(config) {
  const missing = [];
  if (!config.local_url && !config.cloud_url) {
    missing.push('url');
  }
  if (!config.api_key) {
    missing.push('api_key');
  }
  if (!config.org_id) {
    missing.push('org_id');
  }
  return missing;
}

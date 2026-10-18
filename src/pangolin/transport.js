// -----------------------------------------------------------------------------
// Local or cloud: which address of the Pangolin API to call.
//
// The manifest declares both transports. The same Integration API can be
// reached two ways:
//   - local: the Pangolin server on the LAN (http://192.168.1.10:3004/v1), the
//     fast path that keeps working when the Internet link is down;
//   - cloud: over the Internet — Pangolin Cloud (https://api.pangolin.net/v1),
//     or the public address of a self-hosted server.
//
// The user fills in one address or both, and Gladys' standard "Prefer the
// local connection" toggle (GLADYS_PREFER_LOCAL) orders them. The first one is
// the nominal channel; the second one is only a fallback, taken when the first
// does not answer — and then reported as DEGRADED on the transport badge, so
// "it works, but not the way you asked" is visible instead of silent.
//
// Only a channel that does not answer (network error, timeout, 502/503/504 of
// a reverse proxy in front of it) makes the fallback run. An answer such as
// 401 (wrong key) or 404 (unknown organization) is final: the other address
// leads to the same server, and retrying would only hide the real problem.
// -----------------------------------------------------------------------------

import { DEVICE_TRANSPORTS } from '@gladysassistant/integration-sdk';
import { PangolinApiError, PangolinClient, PangolinUnreachableError } from './client.js';

/** Statuses of a gateway in front of a server that does not answer. */
const GATEWAY_STATUSES = new Set([502, 503, 504]);

/**
 * The channels to try, nominal first.
 * @param {object} config normalized configuration (src/config.js)
 * @returns {{ transport: string, url: string }[]}
 */
export function channelsOf(config) {
  const local = config.local_url
    ? { transport: DEVICE_TRANSPORTS.LOCAL, url: config.local_url }
    : null;
  const cloud = config.cloud_url
    ? { transport: DEVICE_TRANSPORTS.CLOUD, url: config.cloud_url }
    : null;
  const ordered = config.GLADYS_PREFER_LOCAL === false ? [cloud, local] : [local, cloud];
  return ordered.filter(Boolean);
}

/** Whether an error means "this address does not answer", so the next one may. */
export function isUnreachable(err) {
  return (
    err instanceof PangolinUnreachableError ||
    (err instanceof PangolinApiError && GATEWAY_STATUSES.has(err.status))
  );
}

/**
 * Run `operation` against the first channel that answers.
 *
 * Resolves `{ result, transport, degraded }`: `degraded` is true when the
 * nominal channel did not answer and the fallback did. Rejects with the error
 * of the last channel tried; an error that is not "unreachable" is thrown at
 * once.
 *
 * @template T
 * @param {object} config normalized configuration
 * @param {(client: PangolinClient) => Promise<T>} operation
 * @param {{ fetch?: typeof fetch, timeoutMs?: number }} [options]
 * @returns {Promise<{ result: T, transport: string, degraded: boolean, fallbackReason?: string }>}
 */
export async function callPangolin(config, operation, options = {}) {
  const channels = channelsOf(config);
  if (channels.length === 0) {
    throw new Error('No Pangolin API address configured');
  }
  let lastError;
  for (const [index, channel] of channels.entries()) {
    const client = new PangolinClient({ baseUrl: channel.url, apiKey: config.api_key, ...options });
    try {
      const result = await operation(client);
      return {
        result,
        transport: channel.transport,
        degraded: index > 0,
        fallbackReason: index > 0 ? lastError?.message : undefined,
      };
    } catch (err) {
      if (!isUnreachable(err)) {
        throw err;
      }
      lastError = err;
    }
  }
  throw lastError;
}

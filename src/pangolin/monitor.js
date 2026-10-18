// -----------------------------------------------------------------------------
// The view of the Pangolin organization, refreshed on a timer.
//
// One refresh = two requests (sites, public resources), whatever the number of
// devices: the states of every device, the scene triggers and the dashboard
// widget are all served from the same snapshot, so the API is never asked the
// same thing twice in a row.
//
// The monitor knows nothing about Gladys: it reads, remembers, and says what
// CHANGED since the previous successful read — a site that went offline, a
// resource whose health changed, the API that stopped (or started again)
// answering. index.js turns those transitions into states, scene events and
// widget nudges.
//
// The first read after a start or a configuration change reports no
// transition: "the site is offline" at startup is a state, not an event, and
// firing it would wake every scene each time the container restarts.
// -----------------------------------------------------------------------------

import { callPangolin } from './transport.js';
import { hasOnlineState } from '../devices/site.js';
import { healthOf } from '../devices/resource.js';

/** What a transition is about. */
export const TRANSITIONS = {
  SITE_STATUS: 'site-status',
  RESOURCE_HEALTH: 'resource-health',
  CONNECTION: 'connection',
};

/**
 * Transitions between two successive snapshots.
 * @returns {object[]}
 */
export function diffSnapshots(previous, next) {
  if (!previous) {
    return [];
  }
  const transitions = [];
  const previousSites = new Map(previous.sites.map((item) => [item.siteId, item]));
  for (const item of next.sites) {
    const before = previousSites.get(item.siteId);
    if (before && hasOnlineState(before) && hasOnlineState(item) && before.online !== item.online) {
      transitions.push({ kind: TRANSITIONS.SITE_STATUS, site: item });
    }
  }
  const previousResources = new Map(previous.resources.map((item) => [item.resourceId, item]));
  for (const item of next.resources) {
    const before = previousResources.get(item.resourceId);
    if (before && healthOf(before) !== healthOf(item)) {
      transitions.push({
        kind: TRANSITIONS.RESOURCE_HEALTH,
        resource: item,
        previousHealth: healthOf(before),
      });
    }
  }
  return transitions;
}

/**
 * @param {object} [options]
 * @param {typeof fetch} [options.fetch] injected in the tests
 * @param {() => number} [options.now]
 */
export function createMonitor({ fetch: fetchImpl, now = Date.now } = {}) {
  const state = {
    snapshot: null, // { sites, resources } of the last successful read
    at: null, // when it was read (ms)
    connected: null, // null until the first read, then true / false
    error: null, // the error of the last read, when it failed
    transport: null, // 'local' | 'cloud' of the last successful read
    degraded: false, // the fallback channel answered, not the nominal one
    fallbackReason: undefined,
  };
  let inFlight = null;
  // Bumped by reset(): a read started under the previous configuration must
  // not write its answer over the new one.
  let generation = 0;

  async function read(config) {
    const previousSnapshot = state.snapshot;
    const wasConnected = state.connected;
    const startedIn = generation;
    try {
      const outcome = await callPangolin(
        config,
        async (client) => {
          const [sites, resources] = await Promise.all([
            client.listSites(config.org_id),
            client.listResources(config.org_id),
          ]);
          return { sites, resources };
        },
        fetchImpl ? { fetch: fetchImpl } : {},
      );
      if (startedIn !== generation) {
        return { ok: false, stale: true, transitions: [] };
      }
      Object.assign(state, {
        snapshot: outcome.result,
        at: now(),
        connected: true,
        error: null,
        transport: outcome.transport,
        degraded: outcome.degraded,
        fallbackReason: outcome.fallbackReason,
      });
      const transitions = diffSnapshots(previousSnapshot, outcome.result);
      if (wasConnected === false) {
        transitions.push({ kind: TRANSITIONS.CONNECTION, connected: true });
      }
      return { ok: true, transitions };
    } catch (err) {
      if (startedIn !== generation) {
        return { ok: false, stale: true, error: err, transitions: [] };
      }
      // The last snapshot is kept: the widget can still show what was known,
      // and the next successful read compares against it.
      Object.assign(state, { connected: false, error: err });
      return {
        ok: false,
        error: err,
        transitions:
          wasConnected === true
            ? [{ kind: TRANSITIONS.CONNECTION, connected: false, error: err }]
            : [],
      };
    }
  }

  return {
    state,

    /**
     * Read the organization now. Concurrent calls share the same read: a
     * scene action, the widget button and the timer firing together cost one
     * pair of requests.
     */
    refresh(config) {
      if (!inFlight) {
        const current = read(config).finally(() => {
          if (inFlight === current) {
            inFlight = null;
          }
        });
        inFlight = current;
      }
      return inFlight;
    },

    /** Replace one resource in the snapshot (after enabling or disabling it). */
    updateResource(resourceId, changes) {
      const item = state.snapshot?.resources.find(
        (candidate) => candidate.resourceId === resourceId,
      );
      if (item) {
        Object.assign(item, changes);
      }
      return item;
    },

    /** Forget everything: a new configuration may point at another organization. */
    reset() {
      generation += 1;
      inFlight = null;
      Object.assign(state, {
        snapshot: null,
        at: null,
        connected: null,
        error: null,
        transport: null,
        degraded: false,
        fallbackReason: undefined,
      });
    },
  };
}

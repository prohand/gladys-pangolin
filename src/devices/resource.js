// -----------------------------------------------------------------------------
// Device type: PANGOLIN PUBLIC RESOURCE
//
// A public resource is what Pangolin exposes to the Internet: an HTTPS site on
// a domain, or a raw TCP/UDP port, forwarded to one or more targets behind the
// sites. Gladys gets one device per resource:
//   - Enabled: the switch Pangolin shows on the resource. Turning it off makes
//     Pangolin stop serving the resource without deleting it — the
//     "close the door while I am away" control. Controllable from Gladys;
//   - Healthy: the result of the health checks of its targets. Read-only, and
//     only published when Pangolin knows it: a resource without health checks
//     stays "unknown", and publishing a 0 for it would raise false alarms.
//
// The platform id is the numeric `resourceId`, never the domain or the name.
// -----------------------------------------------------------------------------

import { DEVICE_FEATURE_CATEGORIES, DEVICE_FEATURE_TYPES } from '@gladysassistant/integration-sdk';

export const RESOURCE_TYPE = 'resource';

export const RESOURCE_FEATURES = {
  ENABLED: 'enabled',
  HEALTHY: 'healthy',
};

/** The three health values Pangolin uses; anything else counts as unknown. */
export const HEALTH = { HEALTHY: 'healthy', UNHEALTHY: 'unhealthy', UNKNOWN: 'unknown' };

/** Normalized health of a resource. */
export function healthOf(item) {
  return item.health === HEALTH.HEALTHY || item.health === HEALTH.UNHEALTHY
    ? item.health
    : HEALTH.UNKNOWN;
}

/** What the resource answers on: its domain, or its raw port. */
export function addressOf(item) {
  if (item.fullDomain) {
    return item.fullDomain;
  }
  return item.proxyPort ? `:${item.proxyPort}` : '';
}

export const resource = {
  type: RESOURCE_TYPE,

  platformId(item) {
    return String(item.resourceId);
  },

  buildDevice(gladys, item) {
    const ids = gladys.externalIds(RESOURCE_TYPE, this.platformId(item));
    return {
      name: item.name || addressOf(item) || `Pangolin resource ${item.resourceId}`,
      external_id: ids.device,
      features: [
        {
          name: 'Enabled',
          external_id: ids.feature(RESOURCE_FEATURES.ENABLED),
          category: DEVICE_FEATURE_CATEGORIES.SWITCH,
          type: DEVICE_FEATURE_TYPES.SWITCH.BINARY,
          read_only: false,
          has_feedback: true,
          keep_history: true,
          min: 0,
          max: 1,
        },
        {
          name: 'Healthy',
          external_id: ids.feature(RESOURCE_FEATURES.HEALTHY),
          category: DEVICE_FEATURE_CATEGORIES.SWITCH,
          type: DEVICE_FEATURE_TYPES.SWITCH.BINARY,
          read_only: true,
          has_feedback: false,
          keep_history: true,
          min: 0,
          max: 1,
        },
      ],
    };
  },

  states(gladys, item) {
    const ids = gladys.externalIds(RESOURCE_TYPE, this.platformId(item));
    const states = [
      {
        device_feature_external_id: ids.feature(RESOURCE_FEATURES.ENABLED),
        state: item.enabled ? 1 : 0,
      },
    ];
    const health = healthOf(item);
    if (health !== HEALTH.UNKNOWN) {
      states.push({
        device_feature_external_id: ids.feature(RESOURCE_FEATURES.HEALTHY),
        state: health === HEALTH.HEALTHY ? 1 : 0,
      });
    }
    return states;
  },
};

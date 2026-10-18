// -----------------------------------------------------------------------------
// Device type: PANGOLIN SITE
//
// A site is a place Pangolin reaches through a tunnel: a Newt agent, a
// WireGuard peer, or the Pangolin host itself (a "local" site). Gladys gets one
// device per site:
//   - Online: is the tunnel up? Read-only. A local site has no tunnel, so no
//     such feature (Pangolin itself reports no status for it);
//   - Data in / Data out: the traffic counters Pangolin keeps for the site, in
//     megabytes. They grow until someone resets them in Pangolin.
//
// The platform id is the numeric `siteId`: the `niceId` and the name can be
// renamed in Pangolin, and an external id is forever.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
} from '@gladysassistant/integration-sdk';

export const SITE_TYPE = 'site';

export const SITE_FEATURES = {
  ONLINE: 'online',
  DATA_IN: 'data-in',
  DATA_OUT: 'data-out',
};

/** Whether Pangolin reports an online state for this site. */
export function hasOnlineState(site) {
  return site.type !== 'local' && typeof site.online === 'boolean';
}

/** Megabytes rounded to the kilobyte: Pangolin sends long floats. */
function megabytes(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 1000) / 1000 : null;
}

export const site = {
  type: SITE_TYPE,

  platformId(item) {
    return String(item.siteId);
  },

  buildDevice(gladys, item) {
    const ids = gladys.externalIds(SITE_TYPE, this.platformId(item));
    const features = [];
    // A local site never has an online state, but a site can only be created
    // as one: the feature list of a given site does not change over time.
    if (item.type !== 'local') {
      features.push({
        name: 'Online',
        external_id: ids.feature(SITE_FEATURES.ONLINE),
        category: DEVICE_FEATURE_CATEGORIES.SWITCH,
        type: DEVICE_FEATURE_TYPES.SWITCH.BINARY,
        read_only: true,
        has_feedback: false,
        keep_history: true,
        min: 0,
        max: 1,
      });
    }
    features.push(
      {
        name: 'Data in',
        external_id: ids.feature(SITE_FEATURES.DATA_IN),
        category: DEVICE_FEATURE_CATEGORIES.DATA,
        type: DEVICE_FEATURE_TYPES.DATA.SIZE,
        unit: DEVICE_FEATURE_UNITS.MEGABYTE,
        read_only: true,
        has_feedback: false,
        keep_history: true,
        min: 0,
        max: 1_000_000_000,
      },
      {
        name: 'Data out',
        external_id: ids.feature(SITE_FEATURES.DATA_OUT),
        category: DEVICE_FEATURE_CATEGORIES.DATA,
        type: DEVICE_FEATURE_TYPES.DATA.SIZE,
        unit: DEVICE_FEATURE_UNITS.MEGABYTE,
        read_only: true,
        has_feedback: false,
        keep_history: true,
        min: 0,
        max: 1_000_000_000,
      },
    );
    return {
      name: item.name || `Pangolin site ${item.niceId ?? item.siteId}`,
      external_id: ids.device,
      features,
    };
  },

  states(gladys, item) {
    const ids = gladys.externalIds(SITE_TYPE, this.platformId(item));
    const states = [];
    if (hasOnlineState(item)) {
      states.push({
        device_feature_external_id: ids.feature(SITE_FEATURES.ONLINE),
        state: item.online ? 1 : 0,
      });
    }
    for (const [feature, value] of [
      [SITE_FEATURES.DATA_IN, megabytes(item.megabytesIn)],
      [SITE_FEATURES.DATA_OUT, megabytes(item.megabytesOut)],
    ]) {
      if (value !== null) {
        states.push({ device_feature_external_id: ids.feature(feature), state: value });
      }
    }
    return states;
  },
};

// -----------------------------------------------------------------------------
// Device registry.
//
// Unlike a fixed set of hardware, the devices come from the Pangolin API: one
// per site and one per public resource of the organization, read at every
// refresh. Each device type lives in its own file and exposes the same shape:
//   - type                       : the `type` part of the external ids
//   - platformId(item)           : the stable id Pangolin gives the item
//   - buildDevice(gladys, item)  : the discovery payload sent to Gladys
//   - states(gladys, item)       : the current states of its features
//
// A snapshot is `{ sites: [...], resources: [...] }`, as read by
// src/pangolin/monitor.js.
// -----------------------------------------------------------------------------

import { site, SITE_TYPE } from './site.js';
import { resource, RESOURCE_TYPE } from './resource.js';

/** Each device type, with the list of the snapshot it is built from. */
export const DEVICE_TYPES = [
  { blueprint: site, list: 'sites' },
  { blueprint: resource, list: 'resources' },
];

/** Every (blueprint, item) pair of a snapshot. */
function entriesOf(snapshot) {
  return DEVICE_TYPES.flatMap(({ blueprint, list }) =>
    (snapshot?.[list] ?? []).map((item) => ({ blueprint, item })),
  );
}

/** The discovery payload: every site and every resource of the snapshot. */
export function buildDiscoveredDevices(gladys, snapshot) {
  return entriesOf(snapshot).map(({ blueprint, item }) => blueprint.buildDevice(gladys, item));
}

/** Every state the snapshot carries, all devices together. */
export function buildStates(gladys, snapshot) {
  return entriesOf(snapshot).flatMap(({ blueprint, item }) => blueprint.states(gladys, item));
}

/**
 * Split a device external id of this integration into its type and its
 * Pangolin id: `ext:<selector>:resource:12` -> `{ type: 'resource', id: '12' }`.
 * `null` for anything else (another integration, a feature id, a typo).
 */
export function parseDeviceExternalId(gladys, externalId) {
  const prefix = gladys.externalId('');
  if (typeof externalId !== 'string' || !externalId.startsWith(prefix)) {
    return null;
  }
  const parts = externalId.slice(prefix.length).split(':');
  if (parts.length !== 2 || ![SITE_TYPE, RESOURCE_TYPE].includes(parts[0]) || !parts[1]) {
    return null;
  }
  return { type: parts[0], id: parts[1] };
}

/** The snapshot item behind a device external id, or `undefined`. */
export function findItem(gladys, snapshot, externalId) {
  const parsed = parseDeviceExternalId(gladys, externalId);
  if (!parsed) {
    return undefined;
  }
  const entry = DEVICE_TYPES.find(({ blueprint }) => blueprint.type === parsed.type);
  return {
    type: parsed.type,
    item: (snapshot?.[entry.list] ?? []).find(
      (candidate) => entry.blueprint.platformId(candidate) === parsed.id,
    ),
    id: parsed.id,
  };
}

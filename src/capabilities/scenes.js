// -----------------------------------------------------------------------------
// Scene triggers and scene actions (SDK v0.14+, Gladys 5.1+).
//
// Triggers say "this happened" — they are built from the transitions the
// monitor reports between two reads of Pangolin (src/pangolin/monitor.js):
//   - site_status_changed      a site went offline, or came back online;
//   - resource_health_changed  the health checks of a resource changed;
//   - connection_changed       Pangolin stopped (or started again) answering.
// The states themselves (online, healthy, enabled) stay device features: the
// events add what a state cannot carry (the previous health, the name, the
// reason) and fire once per transition.
//
// Actions are operations a scene author places in a scene:
//   - set_resource_enabled  enable or disable a public resource;
//   - refresh_status        read Pangolin now and return the counts.
//
// Keys are forever: scenes store them, a published key is never renamed.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { site } from '../devices/site.js';
import { addressOf, healthOf, HEALTH, resource } from '../devices/resource.js';
import { TRANSITIONS } from '../pangolin/monitor.js';

const logger = createLogger({ name: 'scenes' });

export const SCENE_TRIGGERS = {
  SITE_STATUS_CHANGED: 'site_status_changed',
  RESOURCE_HEALTH_CHANGED: 'resource_health_changed',
  CONNECTION_CHANGED: 'connection_changed',
};

/** Every trigger key the code fires (checked against the manifest by the tests). */
export const SCENE_TRIGGER_KEYS = Object.values(SCENE_TRIGGERS);

/**
 * The scene events of a list of transitions: `[{ key, data }]`. `data` is flat
 * and only carries keys the trigger declares (`fields` + `variables`).
 */
export function sceneEventsOf(gladys, transitions, config) {
  return transitions.map((transition) => {
    switch (transition.kind) {
      case TRANSITIONS.SITE_STATUS:
        return {
          key: SCENE_TRIGGERS.SITE_STATUS_CHANGED,
          data: {
            device: site.buildDevice(gladys, transition.site).external_id,
            status: transition.site.online ? 'online' : 'offline',
            site_name: String(transition.site.name ?? ''),
          },
        };
      case TRANSITIONS.RESOURCE_HEALTH:
        return {
          key: SCENE_TRIGGERS.RESOURCE_HEALTH_CHANGED,
          data: {
            device: resource.buildDevice(gladys, transition.resource).external_id,
            health: healthOf(transition.resource),
            previous_health: transition.previousHealth,
            resource_name: String(transition.resource.name ?? ''),
            address: addressOf(transition.resource),
          },
        };
      case TRANSITIONS.CONNECTION:
        return {
          key: SCENE_TRIGGERS.CONNECTION_CHANGED,
          data: {
            status: transition.connected ? 'connected' : 'disconnected',
            // The reason in English: a scene variable is one string, and the
            // English text is the one every Gladys falls back to.
            reason: transition.connected ? '' : String(transition.error?.message ?? ''),
            organization: config.org_id,
          },
        };
      default:
        throw new Error(`Unknown transition: ${transition.kind}`);
    }
  });
}

/** Counts of a snapshot, for the refresh_status outputs and the widget. */
export function countsOf(snapshot) {
  const sites = snapshot?.sites ?? [];
  const resources = snapshot?.resources ?? [];
  return {
    sites_total: sites.length,
    sites_online: sites.filter((item) => item.online === true).length,
    sites_offline: sites.filter((item) => item.online === false).length,
    resources_total: resources.length,
    resources_enabled: resources.filter((item) => item.enabled).length,
    resources_disabled: resources.filter((item) => !item.enabled).length,
    resources_healthy: resources.filter((item) => healthOf(item) === HEALTH.HEALTHY).length,
    resources_unhealthy: resources.filter((item) => healthOf(item) === HEALTH.UNHEALTHY).length,
  };
}

// Each handler receives `app`, the operations index.js exposes (see
// src/app.js): never a fresh API call of its own, so a scene shares the
// snapshot, the transport choice and the states with everything else.
export const SCENE_ACTIONS = {
  async set_resource_enabled(app, { fields }) {
    logger.info(`Scene action set_resource_enabled <- ${fields.device} = ${fields.enabled}`);
    const enabled = await app.setResourceEnabled(fields.device, fields.enabled !== false);
    return { enabled };
  },

  async refresh_status(app) {
    logger.info('Scene action refresh_status');
    const outcome = await app.refresh();
    const counts = countsOf(app.monitor.state.snapshot);
    return {
      connected: outcome.ok === true,
      sites_online: counts.sites_online,
      sites_offline: counts.sites_offline,
      resources_unhealthy: counts.resources_unhealthy,
      resources_disabled: counts.resources_disabled,
    };
  },
};

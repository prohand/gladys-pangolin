// -----------------------------------------------------------------------------
// The integration itself: wires the SDK to Pangolin.
//
// `createApp(gladys)` registers every handler on the SDK client it is given —
// the real one in index.js, the fake Gladys of the SDK in the tests — and
// returns the operations the scene actions and the widget share. It owns:
//   - the configuration (hot-reloaded through onConfigUpdated);
//   - the refresh timer: one read of Pangolin every `poll_frequency` seconds,
//     whose result feeds the states, the transport badges, the scene triggers,
//     the connection status and the widget;
//   - the commands: enable / disable a resource.
//
// Gladys' own poll (`should_poll`) is not used: one read serves every device,
// and the scene triggers must keep firing for sites the user never created as
// devices.
// -----------------------------------------------------------------------------

import { createLogger, DEVICE_TRANSPORTS } from '@gladysassistant/integration-sdk';
import { missingSettings, normalizeConfig } from './config.js';
import { buildDiscoveredDevices, buildStates, findItem } from './devices/index.js';
import { RESOURCE_FEATURES, RESOURCE_TYPE } from './devices/resource.js';
import { createMonitor } from './pangolin/monitor.js';
import { callPangolin } from './pangolin/transport.js';
import {
  describeDegraded,
  describeError,
  describeMissing,
  testConnection,
} from './pangolin/connection.js';
import { SCENE_ACTIONS, sceneEventsOf } from './capabilities/scenes.js';
import { refreshWidgets, WIDGETS } from './capabilities/widget.js';

const logger = createLogger({ name: 'pangolin' });

/** A stable value is re-sent this often, so Gladys keeps it recently dated. */
export const STATE_HEARTBEAT_MS = 30 * 60 * 1000;

/**
 * @param {import('@gladysassistant/integration-sdk').GladysIntegration} gladys
 * @param {{ fetch?: typeof fetch }} [options]
 */
export function createApp(gladys, { fetch: fetchImpl } = {}) {
  let config = normalizeConfig();
  const monitor = createMonitor({ fetch: fetchImpl });
  const callOptions = fetchImpl ? { fetch: fetchImpl } : {};
  let timer = null;
  // What was last told to Gladys, to only say it again when it changes.
  let discoveredKey = null;
  let statusKey = null;

  // --- Publishing ------------------------------------------------------------

  /** External ids of the devices the user created, with their features. */
  function createdFeatureIds() {
    return new Set(
      (gladys.devices ?? []).flatMap((device) => (device.features ?? []).map((f) => f.external_id)),
    );
  }

  /**
   * States of the created devices only: Gladys drops the states of a feature
   * that does not exist, and the SDK forgets them when a device is created, so
   * they are sent again then (see onDeviceCreated).
   */
  async function publishStates() {
    const created = createdFeatureIds();
    const states = buildStates(gladys, monitor.state.snapshot).filter((state) =>
      created.has(state.device_feature_external_id),
    );
    if (states.length > 0) {
      await gladys.publishChangedStates(states, { heartbeat: STATE_HEARTBEAT_MS });
    }
  }

  /** Re-publish the discovery list when the set of sites / resources changed. */
  async function publishDiscovery({ force = false } = {}) {
    const devices = buildDiscoveredDevices(gladys, monitor.state.snapshot);
    const key = JSON.stringify(devices);
    if (force || key !== discoveredKey) {
      await gladys.publishDiscoveredDevices(devices);
      discoveredKey = key;
    }
  }

  /**
   * The transport badge of every created device: the channel the last read
   * went through, degraded when it was the fallback, unreachable when the read
   * failed or the item is no longer in Pangolin.
   */
  async function publishTransports() {
    const { state } = monitor;
    const known = new Set(
      buildDiscoveredDevices(gladys, state.snapshot).map((device) => device.external_id),
    );
    const prefix = gladys.externalId('');
    const entries = (gladys.devices ?? [])
      .filter((device) => device.external_id?.startsWith(prefix))
      .map((device) => {
        if (state.connected !== true || !known.has(device.external_id)) {
          return { external_id: device.external_id, transport: DEVICE_TRANSPORTS.UNREACHABLE };
        }
        return state.degraded
          ? {
              external_id: device.external_id,
              transport: state.transport,
              degraded: true,
              message: describeDegraded(state.transport),
            }
          : { external_id: device.external_id, transport: state.transport };
      });
    // publishTransports takes 100 entries per request.
    for (let start = 0; start < entries.length; start += 100) {
      await gladys.publishTransports(entries.slice(start, start + 100));
    }
  }

  /** The application-level status of the Configuration screen, when it changes. */
  async function publishConnectionStatus(connected, message) {
    const key = JSON.stringify([connected, message ?? null]);
    if (key !== statusKey) {
      await gladys.setConnectionStatus(connected, message);
      statusKey = key;
    }
  }

  // --- Refresh ---------------------------------------------------------------

  /**
   * Read Pangolin now and push the outcome everywhere. Concurrent calls (the
   * timer, a scene action and the widget button at once) share one refresh,
   * so a transition is published once, never once per caller.
   */
  let refreshing = null;
  function refresh() {
    if (!refreshing) {
      const current = refreshAndPublish().finally(() => {
        if (refreshing === current) {
          refreshing = null;
        }
      });
      refreshing = current;
    }
    return refreshing;
  }

  /** One refresh. Never throws: a failing step is logged, the next tick retries. */
  async function refreshAndPublish() {
    const missing = missingSettings(config);
    if (missing.length > 0) {
      await publishConnectionStatus(false, describeMissing(missing)).catch((err) =>
        logger.warn('setConnectionStatus failed', err),
      );
      return { ok: false, missing };
    }

    const outcome = await monitor.refresh(config);
    if (outcome.stale) {
      return outcome;
    }
    const steps = [];
    logRoute(outcome);
    if (outcome.ok) {
      steps.push(
        ['publishDiscoveredDevices', () => publishDiscovery()],
        ['publishChangedStates', () => publishStates()],
        ['setConnectionStatus', () => publishConnectionStatus(true)],
      );
    } else {
      steps.push([
        'setConnectionStatus',
        () => publishConnectionStatus(false, describeError(outcome.error, config)),
      ]);
    }
    steps.push(['publishTransports', () => publishTransports()]);
    for (const event of sceneEventsOf(gladys, outcome.transitions, config)) {
      logger.info(`Scene event ${event.key} ${JSON.stringify(event.data)}`);
      steps.push([
        `publishSceneEvent ${event.key}`,
        () => gladys.publishSceneEvent(event.key, event.data),
      ]);
    }
    for (const [name, step] of steps) {
      try {
        await step();
      } catch (err) {
        logger.error(`${name} failed`, err);
      }
    }
    // The content is computed from the snapshot that was just read: nudge open
    // dashboards (rate-limited core-side, dropped silently while disconnected).
    refreshWidgets(gladys);
    return outcome;
  }

  /**
   * Say which address answers, or why none does — once per change, not at
   * every tick: a Pangolin down for a night must not fill the logs.
   */
  let lastRoute = null;
  function logRoute(outcome) {
    const { state } = monitor;
    const route = outcome.ok
      ? `${state.transport}${state.degraded ? ' (fallback)' : ''}`
      : `failed: ${outcome.error?.message}`;
    if (route === lastRoute) {
      return;
    }
    lastRoute = route;
    if (!outcome.ok) {
      logger.warn(`Pangolin read failed: ${outcome.error?.message}`);
    } else if (state.degraded) {
      logger.warn(`Fallback address in use (${state.transport}): ${state.fallbackReason}`);
    } else {
      logger.info(`Pangolin answers through the ${state.transport} address`);
    }
  }

  function startTimer() {
    stopTimer();
    timer = setInterval(() => {
      refresh().catch((err) => logger.error('Refresh failed', err));
    }, config.poll_frequency * 1000);
  }

  function stopTimer() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  /** A new configuration: forget the old organization, read the new one. */
  async function applyConfig(rawConfig) {
    const previous = config;
    config = normalizeConfig(rawConfig);
    const target = (c) => JSON.stringify([c.local_url, c.cloud_url, c.api_key, c.org_id]);
    if (target(previous) !== target(config)) {
      monitor.reset();
      // A refresh still running reads the old organization: start a new one
      // instead of joining it.
      refreshing = null;
      lastRoute = null;
    }
    statusKey = null;
    await refresh();
    startTimer();
  }

  // --- Commands --------------------------------------------------------------

  /**
   * Enable or disable a public resource, and publish the state Pangolin
   * confirmed. Resolves the resulting `enabled`.
   */
  async function setResourceEnabled(deviceExternalId, enabled) {
    const found = findItem(gladys, monitor.state.snapshot, deviceExternalId);
    if (!found || found.type !== RESOURCE_TYPE) {
      throw new Error(`Not a Pangolin resource: ${deviceExternalId}`);
    }
    const missing = missingSettings(config);
    if (missing.length > 0) {
      throw new Error(describeMissing(missing).en);
    }
    const resourceId = Number(found.id);
    const { result } = await callPangolin(
      config,
      (client) => client.setResourceEnabled(resourceId, enabled),
      callOptions,
    );
    // Pangolin answers with the updated resource: trust it over the request.
    const confirmed = typeof result?.enabled === 'boolean' ? result.enabled : Boolean(enabled);
    monitor.updateResource(resourceId, { enabled: confirmed });
    const featureId = gladys
      .externalIds(RESOURCE_TYPE, found.id)
      .feature(RESOURCE_FEATURES.ENABLED);
    if (createdFeatureIds().has(featureId)) {
      await gladys.publishChangedStates(
        [{ device_feature_external_id: featureId, state: confirmed ? 1 : 0 }],
        {
          heartbeat: STATE_HEARTBEAT_MS,
        },
      );
    }
    logger.info(`Resource ${resourceId} ${confirmed ? 'enabled' : 'disabled'}`);
    refreshWidgets(gladys);
    return confirmed;
  }

  const app = {
    monitor,
    config: () => config,
    refresh,
    setResourceEnabled,
    stop: stopTimer,
  };

  // --- Handlers (registered before connect) ----------------------------------

  gladys.onScanRequest(async () => {
    logger.info('onScanRequest -> reading Pangolin');
    await refresh();
    await publishDiscovery({ force: true });
  });

  gladys.onSetValue(async (device, feature, value) => {
    logger.info(`onSetValue <- ${feature.external_id} = ${value}`);
    const enabledFeature = (id) =>
      gladys.externalIds(RESOURCE_TYPE, id).feature(RESOURCE_FEATURES.ENABLED);
    const found = findItem(gladys, monitor.state.snapshot, device.external_id);
    if (
      !found ||
      found.type !== RESOURCE_TYPE ||
      feature.external_id !== enabledFeature(found.id)
    ) {
      // Throw: the SDK sends a success:false acknowledgement to Gladys.
      throw new Error(`${feature.external_id} cannot be controlled`);
    }
    await setResourceEnabled(device.external_id, Number(value) === 1);
  });

  gladys.onDeviceCreated(async (device) => {
    // The SDK forgot the values of this device: send them now rather than at
    // the next tick, so the new device does not stay empty for a minute.
    logger.info(`onDeviceCreated <- ${device.external_id}`);
    await publishStates();
    await publishTransports();
  });

  gladys.onAction('test_connection', () => {
    logger.info('Action test_connection');
    return testConnection(config, callOptions);
  });

  for (const [key, handler] of Object.entries(SCENE_ACTIONS)) {
    gladys.onSceneAction(key, (fields) => handler(app, { fields }));
  }

  for (const [key, widget] of Object.entries(WIDGETS)) {
    gladys.onWidgetGet(key, (request) => widget.get(app, request));
    gladys.onWidgetAction(key, (actionKey, params, { settings }) =>
      widget.action(app, { actionKey, params, settings }),
    );
  }

  gladys.onConfigUpdated(async (newConfig) => {
    logger.info('onConfigUpdated -> new configuration received');
    await applyConfig(newConfig);
  });

  // The SDK logs the WebSocket lifecycle itself: these listeners only run the
  // integration's own (re)initialization.
  gladys.on('connected', async () => {
    try {
      // Everything Gladys was told was lost with the socket: tell it again.
      discoveredKey = null;
      await applyConfig(await gladys.getConfig());
    } catch (err) {
      logger.error('Post-connection initialization failed', err);
      await gladys
        .setConnectionStatus(false, {
          en: 'Initialization failed, check the integration logs.',
          fr: "L'initialisation a échoué, consultez les journaux de l'intégration.",
          de: 'Die Initialisierung ist fehlgeschlagen, sieh in den Protokollen der Integration nach.',
          es: 'La inicialización falló, consulte los registros de la integración.',
        })
        .catch(() => {});
    }
  });

  gladys.on('disconnected', () => {
    stopTimer();
  });

  return app;
}

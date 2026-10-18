// -----------------------------------------------------------------------------
// Dashboard widget (SDK v0.14+, Gladys 5.1+): "Pangolin overview".
//
// What a glance at the dashboard should answer: is Pangolin reachable, how
// many sites are up, which resources are in trouble. Three tiles of counts, a
// status list that names the problems first (offline sites, unhealthy then
// disabled resources), and a Refresh button.
//
// The content is computed from the monitor's snapshot, never from a request of
// its own: index.js nudges the widget (requestWidgetRefresh) whenever a read
// changed something, and the TTL is only a safety net.
// -----------------------------------------------------------------------------

import { createLogger, WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { localize, pick } from '../i18n.js';
import { healthOf, HEALTH } from '../devices/resource.js';
import { countsOf } from './scenes.js';
import { describeError, describeMissing, TRANSPORT_NAMES } from '../pangolin/connection.js';
import { missingSettings } from '../config.js';

const logger = createLogger({ name: 'widget' });

/** Widget key, as declared in the manifest `widgets` field. */
export const OVERVIEW_WIDGET = 'pangolin_overview';

/** Keys of the `button` actions the content declares. */
export const WIDGET_ACTIONS = { REFRESH: 'refresh' };

/** Default of the `problems_shown` setting, the same as the manifest. */
export const DEFAULT_PROBLEMS_SHOWN = 5;

/** The status list holds at most 10 rows, one of them the connection. */
const MAX_PROBLEMS = 9;

/** Status labels are capped at 40 characters by the core. */
function shorten(text, max = 40) {
  const value = String(text ?? '');
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function connectionRow(state, config) {
  const label = { en: 'Pangolin', fr: 'Pangolin', de: 'Pangolin', es: 'Pangolin' };
  if (missingSettings(config).length > 0) {
    return {
      label,
      icon: 'settings',
      value: {
        en: 'Not configured',
        fr: 'Non configuré',
        de: 'Nicht eingerichtet',
        es: 'Sin configurar',
      },
      color: WIDGET_COLORS.NEUTRAL,
    };
  }
  if (state.connected === false) {
    return {
      label,
      icon: 'wifi-off',
      value: { en: 'Unreachable', fr: 'Injoignable', de: 'Nicht erreichbar', es: 'Inaccesible' },
      color: WIDGET_COLORS.DANGER,
    };
  }
  if (state.connected !== true) {
    return {
      label,
      icon: 'loader',
      value: { en: 'Connecting…', fr: 'Connexion…', de: 'Verbinde…', es: 'Conectando…' },
      color: WIDGET_COLORS.NEUTRAL,
    };
  }
  const transport = TRANSPORT_NAMES[state.transport] ?? TRANSPORT_NAMES.local;
  return {
    label,
    icon: 'wifi',
    value: localize((language) =>
      pick(language, {
        en: `Connected (${pick(language, transport)})`,
        fr: `Connecté (${pick(language, transport)})`,
        de: `Verbunden (${pick(language, transport)})`,
        es: `Conectado (${pick(language, transport)})`,
      }),
    ),
    color: state.degraded ? WIDGET_COLORS.WARNING : WIDGET_COLORS.SUCCESS,
  };
}

/** The problems, worst first. */
function problemRows(snapshot) {
  const rows = [];
  for (const item of snapshot?.sites ?? []) {
    if (item.online === false) {
      rows.push({
        label: shorten(item.name),
        icon: 'server',
        value: { en: 'Offline', fr: 'Hors ligne', de: 'Offline', es: 'Sin conexión' },
        color: WIDGET_COLORS.DANGER,
      });
    }
  }
  for (const item of snapshot?.resources ?? []) {
    if (item.enabled && healthOf(item) === HEALTH.UNHEALTHY) {
      rows.push({
        label: shorten(item.name),
        icon: 'alert-triangle',
        value: { en: 'Unhealthy', fr: 'En défaut', de: 'Gestört', es: 'Con fallos' },
        color: WIDGET_COLORS.WARNING,
      });
    }
  }
  for (const item of snapshot?.resources ?? []) {
    if (!item.enabled) {
      rows.push({
        label: shorten(item.name),
        icon: 'slash',
        value: { en: 'Disabled', fr: 'Désactivée', de: 'Deaktiviert', es: 'Desactivado' },
        color: WIDGET_COLORS.NEUTRAL,
      });
    }
  }
  return rows;
}

/** How many problem rows the instance asked for, within the bounds. */
function problemsShown(settings) {
  const wanted = Number(settings?.problems_shown ?? DEFAULT_PROBLEMS_SHOWN);
  return Number.isFinite(wanted)
    ? Math.max(0, Math.min(MAX_PROBLEMS, Math.round(wanted)))
    : DEFAULT_PROBLEMS_SHOWN;
}

/**
 * The widget content.
 * @param {object} state the monitor state (src/pangolin/monitor.js)
 * @param {object} config normalized configuration
 * @param {object} [settings] per-instance settings
 */
export function buildOverviewContent(state, config, settings = {}) {
  const components = [];
  const missing = missingSettings(config);
  if (missing.length > 0) {
    components.push({ type: 'text', text: describeMissing(missing) });
  } else if (state.connected === false && state.error) {
    components.push({
      type: 'text',
      variant: 'caption',
      text: shortCaption(describeError(state.error, config)),
    });
  }

  const snapshot = state.snapshot;
  if (snapshot) {
    const counts = countsOf(snapshot);
    components.push(
      {
        type: 'value',
        label: {
          en: 'Sites online',
          fr: 'Sites en ligne',
          de: 'Standorte online',
          es: 'Sitios en línea',
        },
        icon: 'server',
        value: `${counts.sites_online}/${counts.sites_total}`,
        color: counts.sites_offline > 0 ? WIDGET_COLORS.DANGER : WIDGET_COLORS.SUCCESS,
      },
      {
        type: 'value',
        label: {
          en: 'Resources enabled',
          fr: 'Ressources actives',
          de: 'Aktive Ressourcen',
          es: 'Recursos activos',
        },
        icon: 'globe',
        value: `${counts.resources_enabled}/${counts.resources_total}`,
        color: WIDGET_COLORS.PRIMARY,
      },
      {
        type: 'value',
        label: { en: 'Unhealthy', fr: 'En défaut', de: 'Gestört', es: 'Con fallos' },
        icon: 'activity',
        value: counts.resources_unhealthy,
        color: counts.resources_unhealthy > 0 ? WIDGET_COLORS.WARNING : WIDGET_COLORS.SUCCESS,
      },
    );
  }

  const items = [connectionRow(state, config)];
  const problems = problemRows(snapshot);
  const shown = problemsShown(settings);
  items.push(...problems.slice(0, shown));
  if (snapshot && problems.length === 0 && state.connected === true) {
    items.push({
      label: {
        en: 'Sites and resources',
        fr: 'Sites et ressources',
        de: 'Standorte und Ressourcen',
        es: 'Sitios y recursos',
      },
      icon: 'check-circle',
      value: { en: 'All fine', fr: 'Tout va bien', de: 'Alles in Ordnung', es: 'Todo bien' },
      color: WIDGET_COLORS.SUCCESS,
    });
  } else if (problems.length > shown && shown > 0) {
    const more = problems.length - shown;
    items.push({
      label: {
        en: 'Other problems',
        fr: 'Autres problèmes',
        de: 'Weitere Probleme',
        es: 'Otros problemas',
      },
      icon: 'more-horizontal',
      value: more,
      color: WIDGET_COLORS.NEUTRAL,
    });
  }
  components.push({ type: 'status', items });

  if (missing.length === 0) {
    components.push({
      type: 'button',
      label: { en: 'Refresh', fr: 'Actualiser', de: 'Aktualisieren', es: 'Actualizar' },
      icon: 'refresh-cw',
      style: 'secondary',
      action: { key: WIDGET_ACTIONS.REFRESH },
    });
  }

  return {
    // index.js nudges the widget after every read that changed something:
    // the TTL only covers a nudge lost while Gladys was disconnected.
    ttl_seconds: 300,
    components,
  };
}

/** A caption holds 80 characters: keep the start of the reason. */
function shortCaption(message) {
  return Object.fromEntries(
    Object.entries(message).map(([language, text]) => [language, shorten(text, 80)]),
  );
}

export const WIDGETS = {
  [OVERVIEW_WIDGET]: {
    async get(app, { settings }) {
      logger.debug(`onWidgetGet <- ${OVERVIEW_WIDGET}`);
      return buildOverviewContent(app.monitor.state, app.config(), settings);
    },

    async action(app, { actionKey }) {
      logger.info(`onWidgetAction <- ${OVERVIEW_WIDGET}.${actionKey}`);
      if (actionKey !== WIDGET_ACTIONS.REFRESH) {
        // Throwing acks the action as failed: the message reaches the user.
        throw new Error(`Unknown widget action: ${actionKey}`);
      }
      const outcome = await app.refresh();
      if (!outcome.ok) {
        return {
          en: 'Pangolin does not answer: see the integration status.',
          fr: "Pangolin ne répond pas : voir l'état de l'intégration.",
          de: 'Pangolin antwortet nicht: siehe Status der Integration.',
          es: 'Pangolin no responde: vea el estado de la integración.',
        };
      }
      return { en: 'Refreshed', fr: 'Actualisé', de: 'Aktualisiert', es: 'Actualizado' };
    },
  },
};

/** Ask the core to re-pull every widget now. */
export function refreshWidgets(gladys) {
  for (const key of Object.keys(WIDGETS)) {
    gladys.requestWidgetRefresh(key);
  }
}

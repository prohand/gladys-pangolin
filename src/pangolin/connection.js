// -----------------------------------------------------------------------------
// What the user reads about the link to Pangolin: the connection status of the
// Configuration screen, and the answer of the "Test the connection" button.
//
// Every message names the fix, not only the symptom: a 401 is "check the API
// key", a 403 "give the key the permissions", a 404 "check the organization
// ID". The API key is never part of any of them.
// -----------------------------------------------------------------------------

import { localize, pick } from '../i18n.js';
import { missingSettings } from '../config.js';
import { PangolinApiError, PangolinUnreachableError } from './client.js';
import { callPangolin, channelsOf } from './transport.js';

const FIELD_NAMES = {
  url: {
    en: 'a Pangolin API address',
    fr: "une adresse de l'API Pangolin",
    de: 'eine Adresse der Pangolin-API',
    es: 'una dirección de la API de Pangolin',
  },
  api_key: {
    en: 'the API key',
    fr: "la clé d'API",
    de: 'den API-Schlüssel',
    es: 'la clave de API',
  },
  org_id: {
    en: 'the organization ID',
    fr: "l'ID de l'organisation",
    de: 'die Organisations-ID',
    es: 'el ID de la organización',
  },
};

const AND = { en: ' and ', fr: ' et ', de: ' und ', es: ' y ' };

/** "Fill in X and Y", for an incomplete configuration. */
export function describeMissing(missing) {
  return localize((language) => {
    const names = missing.map((key) => pick(language, FIELD_NAMES[key])).join(pick(language, AND));
    return pick(language, {
      en: `Configuration incomplete: fill in ${names}.`,
      fr: `Configuration incomplète : renseignez ${names}.`,
      de: `Konfiguration unvollständig: Trage ${names} ein.`,
      es: `Configuración incompleta: indique ${names}.`,
    });
  });
}

/**
 * Why a call to Pangolin failed, in words the user can act on.
 * @param {Error} err
 * @param {object} config normalized configuration
 */
export function describeError(err, config) {
  const org = config.org_id;
  if (err instanceof PangolinUnreachableError) {
    const detail = err.message;
    return localize((language) =>
      pick(language, {
        en: `Pangolin does not answer (${detail}). Check the address and that the Integration API is enabled.`,
        fr: `Pangolin ne répond pas (${detail}). Vérifiez l'adresse et que l'API d'intégration est activée.`,
        de: `Pangolin antwortet nicht (${detail}). Prüfe die Adresse und ob die Integrations-API aktiviert ist.`,
        es: `Pangolin no responde (${detail}). Compruebe la dirección y que la API de integración esté activada.`,
      }),
    );
  }
  if (err instanceof PangolinApiError) {
    if (err.status === 401) {
      return {
        en: 'Pangolin refused the API key: check it, or create a new one in Pangolin.',
        fr: "Pangolin a refusé la clé d'API : vérifiez-la, ou créez-en une nouvelle dans Pangolin.",
        de: 'Pangolin hat den API-Schlüssel abgelehnt: Prüfe ihn oder erstelle in Pangolin einen neuen.',
        es: 'Pangolin rechazó la clave de API: compruébela o cree una nueva en Pangolin.',
      };
    }
    if (err.status === 403) {
      return localize((language) =>
        pick(language, {
          en: `The API key may not read organization "${org}": give it access to it and the List Sites, List Resources and Update Resource permissions.`,
          fr: `La clé d'API n'a pas accès à l'organisation « ${org} » : donnez-lui cet accès et les permissions Lister les sites, Lister les ressources et Mettre à jour une ressource.`,
          de: `Der API-Schlüssel darf die Organisation „${org}“ nicht lesen: Gib ihm Zugriff darauf und die Berechtigungen Standorte auflisten, Ressourcen auflisten und Ressource aktualisieren.`,
          es: `La clave de API no puede leer la organización «${org}»: dele acceso y los permisos Listar sitios, Listar recursos y Actualizar Recurso.`,
        }),
      );
    }
    if (err.status === 404) {
      return localize((language) =>
        pick(language, {
          en: `Pangolin knows no organization "${org}", or the address is not the one of the Integration API (it ends in /v1).`,
          fr: `Pangolin ne connaît pas d'organisation « ${org} », ou l'adresse n'est pas celle de l'API d'intégration (elle se termine par /v1).`,
          de: `Pangolin kennt keine Organisation „${org}“, oder die Adresse ist nicht die der Integrations-API (sie endet auf /v1).`,
          es: `Pangolin no conoce ninguna organización «${org}», o la dirección no es la de la API de integración (termina en /v1).`,
        }),
      );
    }
    const detail = `HTTP ${err.status}${err.message && err.message !== `HTTP ${err.status}` ? `: ${err.message}` : ''}`;
    return localize((language) =>
      pick(language, {
        en: `Pangolin answered with an error (${detail}).`,
        fr: `Pangolin a répondu par une erreur (${detail}).`,
        de: `Pangolin hat mit einem Fehler geantwortet (${detail}).`,
        es: `Pangolin respondió con un error (${detail}).`,
      }),
    );
  }
  const detail = err?.message ?? String(err);
  return localize((language) =>
    pick(language, {
      en: `Unexpected error: ${detail}`,
      fr: `Erreur inattendue : ${detail}`,
      de: `Unerwarteter Fehler: ${detail}`,
      es: `Error inesperado: ${detail}`,
    }),
  );
}

/** How the transport in use reads in a sentence. */
export const TRANSPORT_NAMES = {
  local: { en: 'local', fr: 'locale', de: 'lokal', es: 'local' },
  cloud: { en: 'Internet', fr: 'Internet', de: 'Internet', es: 'Internet' },
};

/**
 * The fallback message of the transport badge: why the nominal channel was
 * not used. Kept under the 200 characters Gladys allows.
 */
export function describeDegraded(transport) {
  return localize((language) =>
    pick(language, {
      en: `The preferred address does not answer: Gladys uses the ${pick(language, TRANSPORT_NAMES[transport])} one.`,
      fr: `L'adresse préférée ne répond pas : Gladys utilise l'adresse ${pick(language, TRANSPORT_NAMES[transport])}.`,
      de: `Die bevorzugte Adresse antwortet nicht: Gladys nutzt die ${pick(language, TRANSPORT_NAMES[transport])}-Adresse.`,
      es: `La dirección preferida no responde: Gladys usa la dirección ${pick(language, TRANSPORT_NAMES[transport])}.`,
    }),
  );
}

/**
 * Handler of the `test_connection` action: try every configured address, not
 * only the first one that answers, and say what each one gave — a fallback
 * address that is broken too is better found now than the day it is needed.
 *
 * @param {object} config normalized configuration
 * @param {{ fetch?: typeof fetch }} [options]
 */
export async function testConnection(config, options = {}) {
  const missing = missingSettings(config);
  if (missing.length > 0) {
    return describeMissing(missing);
  }
  const lines = [];
  for (const channel of channelsOf(config)) {
    // One channel at a time: callPangolin on a config holding only it.
    const single = {
      ...config,
      local_url: channel.transport === 'local' ? channel.url : '',
      cloud_url: channel.transport === 'cloud' ? channel.url : '',
    };
    try {
      const { result } = await callPangolin(
        single,
        async (client) => {
          const [org, sites, resources] = await Promise.all([
            // Optional: a key without the Get Organization permission still
            // serves everything else, the name is only a nicety here.
            client.getOrg(config.org_id).catch(() => null),
            client.listSites(config.org_id),
            client.listResources(config.org_id),
          ]);
          return { org, sites, resources };
        },
        options,
      );
      const name = result.org?.name ?? config.org_id;
      const online = result.sites.filter((item) => item.online === true).length;
      lines.push(
        localize((language) =>
          pick(language, {
            en: `✔ ${channel.url} (${pick(language, TRANSPORT_NAMES[channel.transport])}): organization "${name}", ${result.sites.length} site(s) including ${online} online, ${result.resources.length} public resource(s).`,
            fr: `✔ ${channel.url} (${pick(language, TRANSPORT_NAMES[channel.transport])}) : organisation « ${name} », ${result.sites.length} site(s) dont ${online} en ligne, ${result.resources.length} ressource(s) publique(s).`,
            de: `✔ ${channel.url} (${pick(language, TRANSPORT_NAMES[channel.transport])}): Organisation „${name}“, ${result.sites.length} Standort(e), davon ${online} online, ${result.resources.length} öffentliche Ressource(n).`,
            es: `✔ ${channel.url} (${pick(language, TRANSPORT_NAMES[channel.transport])}): organización «${name}», ${result.sites.length} sitio(s), ${online} en línea, ${result.resources.length} recurso(s) público(s).`,
          }),
        ),
      );
    } catch (err) {
      const reason = describeError(err, config);
      lines.push(
        localize(
          (language) =>
            `✘ ${channel.url} (${pick(language, TRANSPORT_NAMES[channel.transport])}): ${pick(language, reason)}`,
        ),
      );
    }
  }
  return localize((language) => lines.map((line) => pick(language, line)).join('\n'));
}

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Gladys Assistant **external integration** (Node 22+, ESM, no build step, one runtime
dependency: `@gladysassistant/integration-sdk`) for **Pangolin**, the tunneled reverse proxy
(self-hosted, or Pangolin Cloud). It reads the organization through the Pangolin Integration
API and publishes one device per site (online, data in/out) and one per public resource
(enabled — controllable —, healthy). Gladys 5.1+ adds scene triggers (site status, resource
health, connection), scene actions (enable/disable a resource, refresh now) and a
"Pangolin overview" widget. It started from the official JavaScript template.

## Commands

```bash
npm install
npm test                                    # node --test (built-in runner)
node --test test/app.test.js                # one file
node --test --test-name-pattern "fallback"  # one test by name
npm run lint                                # eslint .
npm run format:check                        # prettier --check . (CI gate)
npm run format                              # prettier --write .
npx github:GladysAssistant/integration-store .   # store admission checks
```

CI runs `format:check`, `lint`, `test` on Node 22 and 24 (+ store checks and a Docker build on
pull requests): run the three before pushing. Releases: **Actions → Release** only (bumps
`package.json`, manifest `version` + `docker_image`, re-runs Prettier, rolls the changelog,
tags, builds, publishes the GitHub Release).

## Architecture

```
index.js                  SDK bootstrap only (createApp + connect + shutdown)
src/app.js                every handler, the refresh timer, publishing (states, transports, events)
src/config.js             DEFAULT_CONFIG (mirrors the manifest defaults) + normalization
src/i18n.js               LANGUAGES = en, fr, de, es; pick / localize
src/pangolin/client.js    Integration API client: unwraps { data }, paginates, typed errors
src/pangolin/transport.js local / cloud order (GLADYS_PREFER_LOCAL) and fallback
src/pangolin/monitor.js   snapshot of the last read + transitions between two reads
src/pangolin/connection.js user-facing status messages + "Test the connection"
src/devices/              one file per device type: site.js, resource.js; index.js = registry
src/capabilities/         scenes.js (triggers + actions), widget.js (pangolin_overview)
test/helpers/fakePangolin.js  in-memory Integration API behind an injected fetch
```

### Invariants worth knowing

- **External ids are forever.** Built with `gladys.externalIds('site' | 'resource', id)` from the
  numeric `siteId` / `resourceId`, never from a name, `niceId` or domain (all renameable).
- **One read serves everything.** A refresh is two requests (sites + resources); states,
  transports, scene events and the widget all come from the monitor's snapshot. Concurrent
  refreshes share one (`app.refresh` and `monitor.refresh` are single-flight).
- **Own timer, no `should_poll`.** Triggers must fire for items not created as devices. States
  are only published for features of created devices (`gladys.devices`), with
  `publishChangedStates` + a 30 min heartbeat; `onDeviceCreated` re-publishes at once.
- **Events are transitions.** The first read after a start or a config change fires nothing; a
  `monitor.reset()` bumps a generation so a read started under the old config is discarded.
- **Fallback only on "does not answer"** (network error, timeout, 502/503/504). 401/403/404 are
  final. Fallback = transport badge `degraded: true` with a message (≤ 200 chars).
- **The API key is a secret**: never logged, never in a message, a scene variable or the widget.
  URLs are normalized (credentials stripped, `/v1` appended).
- **Every feature declares `min`/`max`** (NOT NULL in Gladys). A "local" site has no online
  feature; a resource of unknown health gets no `healthy` state (a 0 would be a false alarm).
- **No loops**: a scene action never fires a scene event by itself.

## Rules

- **Versions belong to the Release workflow.** Never edit `version` in `package.json` or in
  the manifest, nor the `docker_image` tag, by hand. `test/manifest.test.js` checks they agree.
- **Changelog.** Every user-visible change adds a line under `## [Unreleased]` in
  `CHANGELOG.md` (`### Added`, `Changed`, `Fixed`, `Removed`, `Security`). Never write a
  version heading: the Release workflow moves the section.
- **Manifest.** Every text is `{ en, fr, de, es }` (`test/manifest.test.js` walks the whole
  file). The catalog `description` holds 10 to 100 characters per language. Trigger, action,
  widget, setting and config keys are stored by users: never rename them. `gladys_version`
  stays `>=5.1.0` (scene and widget fields). Change the manifest and the handlers together.
- **User-facing text** is `{ en, fr, de, es }` (built with `src/i18n.js`); user docs in
  `docs/en.md`, `docs/fr.md`, `docs/de.md`, `docs/es.md`, kept in sync. German uses Pangolin's
  own word for a site: "Standort".
- **The container rootfs is read-only.** Write nothing outside `/data` (the integration writes
  nothing at all today).
- **Style.** Prettier formats, ESLint catches mistakes. Comments explain why, in English.
  Tests never touch the network: use `test/helpers/fakePangolin.js` and the SDK's
  `createFakeGladys()`; `validateWidgetContent(content)` must stay `[]`.

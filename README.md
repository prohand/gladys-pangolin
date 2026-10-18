# Pangolin — Gladys Assistant integration

External integration connecting [Gladys Assistant](https://gladysassistant.com) to
[Pangolin](https://github.com/fosrl/pangolin), the tunneled reverse proxy — self-hosted or
[Pangolin Cloud](https://pangolin.net).

Built on the official
[JavaScript integration template](https://github.com/GladysAssistant/integration-template-js)
and the SDK
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js).

User documentation: [English](./docs/en.md) · [Français](./docs/fr.md) · [Deutsch](./docs/de.md) ·
[Español](./docs/es.md).

## What it does

| Gladys device               | Features                                        |
| --------------------------- | ----------------------------------------------- |
| One per **site**            | Online (read-only), Data in, Data out (MB)      |
| One per **public resource** | Enabled (**controllable**), Healthy (read-only) |

Since Gladys 5.1 it also extends the scene editor and the dashboard (`src/capabilities/`):

| Capability    | Key                       | What                                              |
| ------------- | ------------------------- | ------------------------------------------------- |
| Scene trigger | `site_status_changed`     | a site goes online or offline                     |
| Scene trigger | `resource_health_changed` | the health of a resource changes                  |
| Scene trigger | `connection_changed`      | Pangolin stops or starts answering                |
| Scene action  | `set_resource_enabled`    | enable or disable a resource → `enabled`          |
| Scene action  | `refresh_status`          | read Pangolin now → counts of sites and resources |
| Widget        | `pangolin_overview`       | connection, counts, problems, Refresh button      |

Plus a **Test the connection** button in the Configuration screen.

## How it talks to Pangolin

The [Integration API](https://docs.pangolin.net/manage/integration-api) (`/v1`), with an
organization API key sent as a Bearer token:

| Request                       | Used for                                   |
| ----------------------------- | ------------------------------------------ |
| `GET /org/{orgId}/sites`      | site devices, online state, traffic        |
| `GET /org/{orgId}/resources`  | resource devices, enabled, health          |
| `POST /resource/{resourceId}` | `{ "enabled": true \| false }`             |
| `GET /org/{orgId}`            | organization name in "Test the connection" |

One refresh = two requests (both lists, paginated), every `poll_frequency` seconds, whatever
the number of devices. The integration drives its own timer rather than Gladys' `should_poll`,
so the scene triggers also fire for items not created as devices.

### Local and cloud transports

The manifest declares `"transports": ["local", "cloud"]`:

- **local** — the Integration API of a self-hosted Pangolin on the LAN
  (`http://192.168.1.10:3004/v1`);
- **cloud** — the same API over the Internet: Pangolin Cloud (`https://api.pangolin.net/v1`) or
  the public address of a self-hosted server.

`GLADYS_PREFER_LOCAL` picks the nominal address; the other one is a fallback, only taken when the
first does not answer (network error, timeout, 502/503/504), and then flagged **degraded** on
the transport badge. A 401/403/404 is final: both addresses lead to the same server.

## Project structure

```
.
├─ index.js                          # SDK bootstrap only
├─ src/
│  ├─ app.js                         # handlers, refresh timer, publishing
│  ├─ config.js                      # defaults + normalization (URL, bounds)
│  ├─ i18n.js                        # { en, fr, de, es } helpers
│  ├─ pangolin/
│  │  ├─ client.js                   # Integration API client (unwrap, pagination, errors)
│  │  ├─ transport.js                # local / cloud order and fallback
│  │  ├─ monitor.js                  # snapshot + transitions between two reads
│  │  └─ connection.js               # status messages + "Test the connection"
│  ├─ devices/                       # one file per device type (site, resource)
│  └─ capabilities/                  # scenes (triggers + actions) and widget
├─ docs/                             # user documentation: en, fr, de, es
├─ test/                             # node --test, fake Gladys (SDK) + fake Pangolin API
├─ gladys-assistant-integration.json # manifest
├─ Dockerfile                        # Node 24 Alpine, non-root, read-only rootfs ready
├─ CHANGELOG.md · SECURITY.md · CLAUDE.md
└─ .github/                          # CI, Release, build, GitHub releases, Dependabot
```

## Run it locally

```bash
npm install
GLADYS_HOST_API_URL="http://localhost:1443" \
GLADYS_INTEGRATION_TOKEN="<token>" \
GLADYS_INTEGRATION_SELECTOR="pangolin" \
LOG_LEVEL=debug \
npm start
```

## Quality checks

```bash
npm run format:check   # Prettier
npm run lint           # ESLint
npm test               # node --test: no network, no Pangolin, no Gladys needed
npx github:GladysAssistant/integration-store .   # store admission checks
```

The CI (`.github/workflows/ci.yml`) runs the first three on Node 22 and 24 for every push and
pull request; pull requests also run the store checks and build the Docker image.

## Release

1. Describe your changes under `## [Unreleased]` in [`CHANGELOG.md`](CHANGELOG.md).
2. **Actions → Release → Run workflow**, pick `patch`, `minor` or `major` (the repository starts
   at `0.0.0`: pick `major` for the first `1.0.0`).
3. The workflow bumps `package.json` and the manifest (`version` + `docker_image`), rolls the
   changelog, tags `vX.Y.Z`, builds the `linux/amd64` + `linux/arm64` image to
   `ghcr.io/prohand/gladys-pangolin`, and publishes the GitHub Release.

Before the first release: make the GHCR package public, add the GitHub topic
`gladys-assistant-integration`, and turn on **Private vulnerability reporting**
([`SECURITY.md`](SECURITY.md) sends reporters there).

## License

Apache-2.0

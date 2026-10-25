# Pangolin

This integration connects Gladys to [Pangolin](https://pangolin.net), the
tunneled reverse proxy that exposes your services to the Internet without
opening a port on your router. It works with a **self-hosted** Pangolin and
with **Pangolin Cloud**.

What you get in Gladys:

- one device per **site** (a Newt tunnel, a WireGuard site, the Pangolin host
  itself), with its **online** state and its traffic (**data in**, **data
  out**);
- one device per **public resource** (an HTTPS site on your domain, a raw
  TCP/UDP port), with an **enabled** switch you can turn off from Gladys and its
  **healthy** state;
- scene triggers, scene actions and a dashboard widget (Gladys 5.1 or later).

Requires **Gladys 5.3.0** or later.

## Before you start

### 1. Enable the Integration API (self-hosted only)

Pangolin Cloud has it already. On a self-hosted Pangolin (Community Edition)
the Integration API is off by default: add this to `config/config.yml`, then
restart Pangolin.

```yaml
flags:
  enable_integration_api: true
```

The API then listens inside the Pangolin container on port **3003** (or
**3004**, depending on the version: check `server.integration_port` in your
configuration). See the
[Pangolin documentation](https://docs.pangolin.net/manage/integration-api) to
publish it on a domain such as `https://api.example.com/v1`.

### 2. Create an API key

In Pangolin, open your organization, then **API Keys → Generate API Key**.
Give it these permissions:

| Permission       | Used for                                            |
| ---------------- | --------------------------------------------------- |
| List Sites       | the site devices                                    |
| List Resources   | the resource devices                                |
| Get Organization | the name shown by "Test the connection" (optional)  |
| Update Resource  | turning a resource on or off from Gladys (optional) |

Copy the key at once: Pangolin shows it only once. It looks like
`abc123xyz.0123456789abcdef`.

Use an **organization** key dedicated to Gladys, never a root key.

### 3. Find the organization ID

It is in the address bar when you browse your organization in Pangolin:
`https://pangolin.example.com/my-org/settings` → `my-org`.

## Configuration

| Field                    | What to put                                                                                                          |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| **Local API address**    | Self-hosted only: the Integration API on your network, e.g. `http://192.168.1.10:3004/v1`. Leave empty otherwise.    |
| **Internet API address** | Pangolin Cloud: `https://api.pangolin.net/v1`. Self-hosted: its public address, e.g. `https://api.example.com/v1`.   |
| **API key**              | The key created above.                                                                                               |
| **Organization ID**      | The ID found above.                                                                                                  |
| **Refresh interval (s)** | How often Pangolin is read (30 to 3600 s, 60 by default). Each read is two requests, whatever the number of devices. |

Fill in at least one of the two addresses. `/v1` is added if you forget it.

Then press **Test the connection**: it tries every address you filled in and
says, for each one, what Pangolin answered — the organization, the number of
sites and resources, or the reason of the failure.

### Local or Internet: the "Prefer the local connection" switch

With both addresses filled in, Gladys calls the one the **Prefer the local
connection** switch points at, and only falls back on the other one when the
first **does not answer** (network down, timeout, a proxy answering 502, 503 or
504). A wrong key or an unknown organization does not make it switch: both
addresses lead to the same server, and the answer would be the same.

Each device shows the address in use on its badge: **local**, **cloud**, or
**unreachable**. An orange dot means Gladys is on the fallback address: it
works, but not the way you asked — check the preferred one.

With a single address, there is no fallback: the badge shows that address, or
unreachable.

## Devices

Open the **Discover** tab of the integration: every site and every public
resource of the organization is listed. Create the ones you want in Gladys.

### Site

| Feature  | Values                         | Notes                                               |
| -------- | ------------------------------ | --------------------------------------------------- |
| Online   | 1 = tunnel up, 0 = tunnel down | Absent on a "local" site: Pangolin reports no state |
| Data in  | megabytes                      | Counter kept by Pangolin, until you reset it there  |
| Data out | megabytes                      | Same                                                |

### Public resource

| Feature | Values                     | Notes                                                                                          |
| ------- | -------------------------- | ---------------------------------------------------------------------------------------------- |
| Enabled | 1 = served, 0 = disabled   | **Controllable**: turning it off makes Pangolin stop serving the resource, without deleting it |
| Healthy | 1 = healthy, 0 = unhealthy | Result of the health checks of its targets. Empty when the resource has no health check        |

Private resources (the ones reached through a Pangolin client) are not
covered.

The devices keep their identity when you rename a site or a resource in
Pangolin: they are tied to Pangolin's internal numbers, not to names or
domains. A site or a resource deleted in Pangolin shows as **unreachable**: you
can delete the device in Gladys.

## Scenes and dashboard (Gladys 5.1)

### Triggers

| Trigger                                       | Filters                                | Variables                                               |
| --------------------------------------------- | -------------------------------------- | ------------------------------------------------------- |
| **A Pangolin site goes online or offline**    | site, new status (online / offline)    | `site_name`, `status`                                   |
| **The health of a Pangolin resource changes** | resource, new health                   | `resource_name`, `address`, `health`, `previous_health` |
| **Pangolin stops or starts answering**        | new status (answering / not answering) | `status`, `reason`, `organization`                      |

They fire **once per change**, at the read that sees it — so within the
refresh interval. Nothing fires at startup or after a configuration change:
"the site is offline" at that moment is a state, not an event. The triggers
work even for sites and resources you did not create as devices.

In a scene, use the variables like any other, e.g.
`{{triggerEvent.data.site_name}} is {{triggerEvent.data.status}}`.

### Actions

| Action                                    | Fields            | Outputs                                                                                   |
| ----------------------------------------- | ----------------- | ----------------------------------------------------------------------------------------- |
| **Enable or disable a Pangolin resource** | resource, enabled | `enabled`                                                                                 |
| **Refresh Pangolin now**                  | —                 | `connected`, `sites_online`, `sites_offline`, `resources_unhealthy`, `resources_disabled` |

Example: when everybody leaves home, enable the "Cameras" resource; when the
first person comes back, disable it.

### Widget "Pangolin overview"

Add it from the dashboard editor. It shows:

- three tiles: sites online, resources enabled, unhealthy resources;
- the connection (local, Internet, orange on the fallback address, red when
  Pangolin does not answer);
- the problems, worst first: offline sites, unhealthy resources, disabled
  resources — as many as the **Problems listed** setting says (0 to 9);
- a **Refresh** button.

## Troubleshooting

| Message                                     | What to do                                                                                                          |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| _Pangolin does not answer (…)_              | Check the address and the port, and that the Integration API is enabled. The reason (ECONNREFUSED, timeout…) helps. |
| _Pangolin refused the API key_              | The key is wrong or was deleted: create a new one.                                                                  |
| _The API key may not read organization "…"_ | The key belongs to another organization, or lacks a permission: see [Create an API key](#2-create-an-api-key).      |
| _Pangolin knows no organization "…"_        | Check the organization ID, and that the address is the API one (ending in `/v1`), not the dashboard one.            |
| A resource cannot be turned off             | The key lacks **Update Resource**.                                                                                  |

The logs of the integration name every failed read and every switch to the
fallback address. The API key never appears in them.

## Security

- The API key is stored in a secret field, sent only to the addresses you
  configured, and never logged.
- Anyone who can press a switch or run a scene in Gladys can open or close
  your public resources: keep that in mind when you share Gladys.
- For the Internet address, use `https://`.

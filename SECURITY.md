# Security policy

## Supported versions

Only the latest release of the Pangolin integration receives security fixes.
Update the integration from the Gladys store before reporting an issue.

| Version      | Supported |
| ------------ | --------- |
| 1.x (latest) | Yes       |
| older        | No        |

## Reporting a vulnerability

Please do **not** open a public issue for a security problem.

Report it privately through GitHub: open the **Security** tab of
[prohand/gladys-pangolin](https://github.com/prohand/gladys-pangolin/security), then
**Report a vulnerability**.

Include, when you can:

- the version of the integration, of Gladys and of Pangolin;
- what an attacker can do, and the steps to reproduce it;
- any log line that helps (remove API keys, passwords, domains and addresses first).

You should get a first answer within 7 days. A fix is released as a new version of
the integration, and the advisory is published once users can update.

## Scope

In scope: the code of this repository and the Docker image it publishes.

Out of scope: Gladys Assistant itself (report to
[GladysAssistant/Gladys](https://github.com/GladysAssistant/Gladys/security)), Pangolin
itself (report to [fosrl/pangolin](https://github.com/fosrl/pangolin/security)) and the
other third-party services the integration talks to.

## What the integration holds, and how it is protected

- **The Pangolin API key** is stored by Gladys in a secret field. The integration sends it
  only as a Bearer token to the API addresses you configured, never logs it and never
  puts it in a message, a scene variable or the widget.
- **It can switch your public resources on and off.** Anyone who can run a scene or
  press a device switch in Gladys can open or close what Pangolin exposes. Keep Gladys
  accounts to people you trust.
- The container runs as a non-root user on a read-only filesystem, and writes nothing
  to disk.

## Good practices for users

- Create a **dedicated organization API key** for Gladys, never a root key.
- Give it only the permissions it needs: **List Sites**, **List Resources**, **Get Organization**, and
  **Update Resource** if you want to enable or disable resources from Gladys (leave
  that one out for a read-only integration).
- Prefer an `https://` address for the Internet API address: over plain `http://` the
  key crosses the network in clear text. Keep `http://` for a LAN address only.
- Revoke the key in Pangolin if you uninstall the integration.
- Keep Gladys, Pangolin and the integration up to date.

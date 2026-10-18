# Changelog

All notable changes to this integration are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[semantic versioning](https://semver.org/), bumped by the Release workflow.

Describe each change under `## [Unreleased]

## [0.0.1] - 2026-10-18

` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

### Added

- First version of the Pangolin integration, built on the official JavaScript template.
- One device per Pangolin site (online, data in, data out) and per public resource
  (enabled, healthy), read from the Pangolin Integration API with an organization API key.
- Enable or disable a public resource from Gladys (device switch, scene action).
- Local and cloud transports: a LAN address and an Internet address (Pangolin Cloud or the
  public address of a self-hosted server), ordered by the "Prefer the local connection"
  switch; the other one takes over when the first does not answer, shown as degraded.
- Scene triggers (Gladys 5.1+): a site goes online or offline, the health of a resource
  changes, Pangolin stops or starts answering.
- Scene actions (Gladys 5.1+): enable or disable a resource, refresh Pangolin now.
- "Pangolin overview" dashboard widget (Gladys 5.1+): connection, sites online, resources
  enabled, the problems to look at, and a Refresh button.
- "Test the connection" button, which tries every configured address.
- English, French, German and Spanish: configuration screen, messages, widget and
  documentation.
- CI (format, lint, tests on Node 22 and 24, store checks, Docker build), Release and
  GitHub releases workflows, Dependabot, `SECURITY.md` and `CLAUDE.md`.

[Unreleased]: https://github.com/prohand/gladys-pangolin/compare/v0.0.1...HEAD
[0.0.1]: https://github.com/prohand/gladys-pangolin/releases/tag/v0.0.1

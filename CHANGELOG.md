# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.0.0] - 2026-11-25

The first release on plugin-contract v0, written greenfield.

### Added

- The `capabilities` manifest: 25 methods (3 own and 22 pass-through `mcp:<tool>` rows), one events source
  `ashby.interviews`, no actions, and the one bus event `changed`.
- `accounts` through the contract's `accounts` module: one Ashby MCP server per alias (`ashby`, `ashby-work`, …), each
  with its own OAuth; `account` on `events_list` and `probe`; `ACCOUNT_REQUIRED` and `ACCOUNT_UNKNOWN`.
- `events_list` and `probe` as agent tools, Code Mode entries and methods of the one RPC id `ashby`.
- The interviews source: metadata-only meeting events, a 30-minute settle window, 7-day windows with a 13-window cap, a
  7-day cursor lookback, a 40-entry seen list, cancelled interviews never listed, and a page read whole or not at all.
- `status` per alias from the host's MCP server state, with the agents the generated access rules miss.
- One `execute.after` hook that emits `changed` after a completed non-read pass-through tool result.
- Generated docs, two skills, and the conformance, host and pack tests.

### Removed

- The old app-specific, `sources` and `opencode` package keys; the copied kit under `scripts/`; the copied grant
  verifier; the tools RPC and the `describe` transport; the terminal UI, the status command and the listing watcher.

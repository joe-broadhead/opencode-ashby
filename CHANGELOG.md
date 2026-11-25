# Changelog

## 0.0.0 (2026-11-25)

- One manifest: 25 methods — 3 own (`status`, `events_list`, `probe`) and 22 pass-through `mcp:<tool>` rows (14 read,
  5 write, 3 send) — one events source `ashby.interviews`, no actions and no bus event.
- Accounts through the contract's `accounts` module: one Ashby MCP server per alias (`ashby`, `ashby-work`, …), each
  with its own OAuth, permission rules and cursor; `account` on `events_list` and `probe`; `ACCOUNT_REQUIRED` and
  `ACCOUNT_UNKNOWN`.
- `events_list` and `probe` as agent tools, Code Mode entries and methods of the one RPC id `ashby`.
- The interviews source: metadata-only meeting events, a 30-minute settle window, 7-day windows with a 13-window cap, a
  7-day lookback with a 40-entry seen list, a total-order `(start, id)` cursor, cancelled interviews never listed, and a
  page read whole or `UNAVAILABLE`.
- `status` from the host's MCP server state through `statusAnswer`; `probe` reads OpenCode's sign-in and calls Ashby for
  nothing.
- The two skills, `ashby` and `ashby-write`, are read from `skills/<id>/SKILL.md` at setup and registered through
  `ctx.skill.transform`, so OpenCode loads them; a missing or broken file is reported in `status` and does not stop the
  plugin.
- Generated docs, two skills, `AGENTS.md`, and the conformance, unit, host and pack tests.

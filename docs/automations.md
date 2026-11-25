# Automations

An OpenCode automation can read interviews on a timer and hand them to an agent or a script. Its code action runs in
Code Mode with the plugin's tools, and OpenCode keeps the automation's `state` between runs, which is where the cursor
belongs. The plugin emits `changed` after a pass-through write, but the source's own correctness is the cursor: pull is
the truth, the nudge only makes a re-read sooner.

<!-- generated:automations -->
| Source | Method | Provider floor | Suggested | Signals |
|---|---|---|---|---|
| `ashby.interviews` | `tools.ashby.events_list` | — | 2 min | `bus` |
<!-- /generated:automations -->

## A timer recipe

The suggested cadence is 2 minutes. An interview is only listed once it started 30 minutes ago, so a slower timer is
also fine. Create the automation through OpenCode's automation API (`POST /api/experimental/automation`, or
`ctx.experimental.automation.create` from a plugin) with a `code` action:

```json
{
  "sessionID": "<the session it runs as>",
  "name": "Ashby interviews",
  "trigger": { "type": "every", "every": "2 minutes" },
  "action": {
    "type": "code",
    "code": "const state = input.state ?? {}; const account = input.args.account; const page = await tools.ashby.events_list({ account, ...(state.cursor === undefined ? {} : { cursor: state.cursor }), limit: 100 }); for (const event of page.events) { /* metadata only: event.text is empty */ } if (page.failed === undefined) state.cursor = page.cursor; return { state }",
    "args": { "account": "work" }
  }
}
```

The code action receives the automation's `state` and returns the next one; OpenCode stores it as the automation's
`state` (the same value `GET /api/experimental/automation/<id>` reports). Pass the alias in `args`, not in the code, so
one automation per account is a copy with one field changed.

Rules of thumb:

- One automation per alias, each with its own cursor. A cursor from `work` is `CURSOR_INVALID` under `personal`.
- Do not read `more: false` as "finished": a later call may list new interviews. The next timer run reads on.
- A `gap` means history was lost; the page where it appears says so once, and the cursor moves on.
- `failed[]` holds the cursor back. Keep the previous cursor and try again; `refused[]` never does, so the cursor may
  move past it.
- `tools.ashby.status` and `tools.ashby.probe` are available to the same code action. `status` needs no account;
  `probe` names the signed-in credential of one alias.
- Say "OpenCode automation", not "cron job": the schedule and its wakeups belong to OpenCode.

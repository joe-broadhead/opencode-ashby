# Architecture

The plugin is a thin contract layer over Ashby's own MCP server. OpenCode owns the MCP transport, OAuth, credentials,
permission prompts and result limits; Ashby owns its 22 tool inputs and results. The plugin declares the accounts,
writes one handler table for its three own methods, reads `list_interviews` through OpenCode's own executor, reports
status, and registers its two skills. It has no runtime dependencies and no credentials of its own.

## Layout

| Path                         | Role                                                                                                                                 |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `src/index.ts`               | `Plugin.define({ id, setup })`: the host gate, the accounts, the handler table, `register`, the two skills           |
| `src/manifest.ts`            | Reads `package.json`, validates and exports `capabilities`, the version and the package name                         |
| `src/accounts.ts`            | The one server-name derivation (`accountName`), and the host's record of one alias's server                                          |
| `src/provider/index.ts`      | The only place the Ashby endpoint is named; `ctx.tool.list()`/`execute`, result and error mapping, the owner from OpenCode's sign-in |
| `src/provider/interviews.ts` | Ashby's `list_interviews` envelope, the interview facts, the event, and contact masking                                              |
| `src/handlers/index.ts`      | The one handler table: `status`, `events_list`, `probe`                                                                              |
| `src/handlers/status.ts`     | `statusAnswer` from the accounts module, one state per alias                                                                         |
| `src/handlers/events.ts`     | The windows, the lookback, the cursor and the page                                                                                   |
| `src/handlers/probe.ts`      | The signed-in owner of one alias                                                                                                     |
| `src/skills.ts`              | Reads `skills/<id>/SKILL.md`, parses its YAML frontmatter (including `>`, `|` block scalars), checks it and registers it through `ctx.skill.transform` |

## Setup

1. `assertHost(ctx, manifest)` reads `ctx.app.version` against `>=2.4.1 <2.5.0` and refuses an untested release with
   `HOST_UNTESTED` and a next step, before anything is wired. `allowUntestedHost: true` starts it anyway.
2. `readSkills()` reads every `skills/<id>/SKILL.md`, parses its frontmatter as YAML (so `>`, `|`, `>-` and `|-`
   descriptions register their text) and checks the name, description and body; a malformed file fails setup with
   `SCHEMA_VIOLATION`.
3. `registerAccounts(ctx, { manifest, options, server })` registers one Ashby MCP server per alias through
   `ctx.mcp.transform`: `ashby` for `default`, `ashby-work` for `work`. The endpoint is the same for every alias; the
   OAuth credential is keyed by the server name. A transform that throws is recorded as a status problem, never fatal.
4. `createProvider(ctx)` closes over the host context; nothing is cached between calls.
5. `createHandlers(...)` builds one handler per own method and passes the manifest's `maxBytes` for the source.
6. `register(ctx, manifest, handlers)` validates the table against `methods`, generates the access rules into every
   agent, and registers the three tools in the `ashby` namespace and the one RPC id `ashby`.
7. `registerSkills(ctx, skills)` adds every checked skill through `ctx.skill.transform`. Setup returns one cleanup
   that disposes the skill registration and the registration.

The manifest declares the vendor's tools as 22 explicit `mcp:<tool>` rows. `register` refuses a handler for an `mcp:`
method: the vendor's server owns the tool and its input, so the plugin neither proxies nor re-registers it. That is why
those rows are `accounts: "none"`: the account is the server the agent calls (`ashby-work_add_note_to_candidate`), and
the tool takes no `account` argument. The contract's access module derives the same `<server>_<tool>` action for the
generated rules.

## The provider

`list_interviews` is the plugin's only direct Ashby read. `createProvider(ctx).listInterviews`:

1. looks up the alias's server with `ctx.mcp.list()` and refuses before any call when it is missing, disabled, still
   connecting or failed (`UNAVAILABLE`, with the state and a next step), or needs a sign-in (`NEEDS_SIGN_IN`);
2. derives the server name with `accountName` and the tool's effective id with `toolAction`, then finds that tool in
   `ctx.tool.list()`;
3. calls the tool's own `execute` with the method call's session, agent, message id, call id, signal and progress, so
   OpenCode sends the alias's credential and applies the alias's permission rule;
4. reads the structured output, or its JSON text, or the text; an empty answer is `UNAVAILABLE`, never zero;
5. maps a `Tool.Error` with a cause to `PERMISSION_DENIED`, Ashby's rate limit to `RATE_LIMITED`, and anything else to
   `UNAVAILABLE`, on one redacted line. A call that never connects is refused, never awaited.

`owner(alias)` reads `ctx.integration.connection.active` for the integration the host attached to the alias's server and
returns `ashby:credential:<id>` with the credential's label and `verified: false`. It calls Ashby for nothing, which the
manifest states by declaring no operation for `probe`.

Nothing is cached. The tool list is read on every provider call, so a server that reconnects or lists a new tool is
seen at once; a cursor, not a cache, is what makes a read resumable.

## Support

`status` reads only the host: `ctx.mcp.list()` for each alias's server state, never Ashby. `connected` and `pending`
are `ready` (the host is connecting), `needs_auth` is `needs_sign_in`, and `disabled`, `failed` or a missing server is
`error` with a redacted reason. The handler passes `await call.unguardedAgents()` to `statusAnswer`; that call answers
`{ ok: true, agents }` or `{ ok: false, error }`, and `statusAnswer` records an unreadable list as a problem and answers
with an empty list. It keeps no state between `register` and the call.

## OpenCode APIs used

| API                                                          | Why                                                       |
| ------------------------------------------------------------ | --------------------------------------------------------- |
| `Plugin.define`                                              | The one server entry                                      |
| `ctx.app.version`                                            | The host gate                                             |
| `ctx.mcp.transform`, `ctx.mcp.list()`                        | One Ashby server per alias, and its state                 |
| `ctx.tool.transform` (through `register`)                    | The three own tools, in the `ashby` namespace             |
| `ctx.tool.list()`, `tool.execute`                            | `list_interviews` through the vendor's own executor       |
| `ctx.integration.connection.active`                          | The signed-in owner `probe` and every page name           |
| `ctx.skill.transform`                                        | The plugin's two skills, from `skills/<id>/SKILL.md`       |
| `ctx.agent.transform`, `ctx.agent.list` (through `register`) | The generated access rules, and status's unguarded agents |
| `ctx.rpc.register` (through `register`)                      | The one RPC id `ashby`                                    |

No private OpenCode API is used. The bundle keeps only `@opencode/*` external; the contract is bundled, and there are no
runtime dependencies. `npm run bundle` writes the committed `dist/index.js`, and `npm run check` fails when it is stale.

# Configuration

Every option is optional. The smallest setup is one entry in `plugins`:

```json
{
  "plugins": ["@joe-broadhead/opencode-ashby"]
}
```

To set options, use the object form:

```json
{
  "plugins": [{ "package": "@joe-broadhead/opencode-ashby", "options": { "allowUntestedHost": true } }]
}
```

## Options

### `allowUntestedHost`

- Type: `true` or `false`.
- Default: `false`.

The plugin supports OpenCode `>=2.2.3 <2.3.0`, the range `opencode.host` in `package.json` declares, and every check
runs on 2.2.3, 2.2.4 and 2.2.5, the tested releases. Status shows the version, whether it is tested and the supported
range in its `OpenCode` row, for example `2.2.5 (tested; supported range >=2.2.3 <2.3.0)`.

- **A tested release:** the plugin starts.
- **Another release inside the range, such as 2.2.6:** the plugin starts too. Status marks the version `untested`, and
  the status RPC's `host.tested` is `false`. The next step is the same as on a tested release.
- **Outside the range, including 2.3.0, prereleases and development builds:** the plugin refuses to start, and
  `/plugins` shows:

  ```text
  HOST_UNTESTED: This plugin supports OpenCode >=2.2.3 <2.3.0, found 2.3.0. Next step: Use OpenCode >=2.2.3 <2.3.0, or set the plugin option "allowUntestedHost": true to run anyway.
  ```

- **Outside the range with `"allowUntestedHost": true`:** it starts anyway, and `/ashby-status` and `/ashby` show
  a warning.

There is no other option. To narrow what the model may do in Ashby, use permission rules; see
[Permissions](#permissions).

## Your own `mcp.servers.ashby`

If your config defines no server named `ashby`, the plugin registers one:

```json
{ "type": "remote", "url": "https://mcp.ashbyhq.com/mcp/v1" }
```

There is no `oauth` block, and none is needed. Ashby's sign-in challenge and its server metadata name the scopes
`openid mcp offline_access`, and OpenCode requests them as given, so Ashby can issue a refresh token. Ashby may still
issue none, and then a sign-in cannot be renewed: the README's Troubleshooting has the row. OpenCode registers
itself with Ashby's sign-in server on first use: there is no client ID to set, and OpenCode's defaults apply to
everything else.

Sign in and out with `/connect` → Ashby, or from a terminal in the project folder where the plugin is installed:
`opencode mcp auth ashby` and `opencode mcp logout ashby`. If either answers `MCP server not found: ashby`, OpenCode
is still opening that folder: wait a few seconds and run it again.

To change anything else, define `mcp.servers.ashby` yourself at Ashby's URL. The plugin then **adopts** your entry
unchanged, and `/ashby-status` shows "Connection: connected (…, your own mcp.servers.ashby, used unchanged)". The
permission rules and skills still apply. Of your entry the plugin reads only its type, its URL and whether `oauth` is
`false`; it never reads, copies or reports its `headers`.

Ashby's server signs in only with OAuth. An entry with `"oauth": false` cannot connect: status names it as "your own
mcp.servers.ashby without OAuth", and its next step is to remove that line. Ashby's REST API keys are organisation-wide
admin credentials that skip your own access roles, and the MCP server does not take them.

### A conflict

The plugin compares origin and path, so a trailing slash or a query string still matches. Any other URL, or a local
command, is a **conflict**: the plugin leaves your entry alone, adds nothing, status shows "Connection: conflict", and
gives the next step. A conflicting entry at another origin shows only its origin, because a path can hold a secret;
Ashby's own origin keeps its path, so a wrong one is visible.

```text
- Next step: Your OpenCode config defines mcp.servers.ashby with https://ashby-mcp.example.com/…, but the plugin uses https://mcp.ashbyhq.com/mcp/v1. Point it at https://mcp.ashbyhq.com/mcp/v1 or remove it, then restart OpenCode.
```

## Permissions

OpenCode asserts every MCP call itself, with the action `ashby_<tool>` and the resource `*`. The plugin adds these
rules to every agent that starts with the base rule `{ "action": "*", "resource": "*", "effect": "allow" }`, directly
after that rule:

```json
[
  { "action": "ashby_*", "resource": "*", "effect": "ask" },
  { "action": "ashby_describe_object_fields", "resource": "*", "effect": "allow" },
  { "action": "ashby_search_records_by_name", "resource": "*", "effect": "allow" },
  { "action": "ashby_change_application_stage", "resource": "*", "effect": "deny" },
  { "action": "ashby_submit_mcp_feedback", "resource": "*", "effect": "deny" }
]
```

That sample leaves out the other ten read allows, which sit between the two shown; `/ashby-status` prints the whole
block, and its `Agents without default rules` row prints it as a list to paste.

`READ_TOOLS` in `src/ashby-tools.ts` lists Ashby's read tools, `WRITE_TOOLS` its write tools, and `DENIED_TOOLS` the
two that are off. Writes and tools that Ashby adds later match only `ashby_*`, so they ask. `/ashby-status` names the
tools in no list. Ashby may list fewer tools for a user with less access, so a known tool can be missing; that is
normal.

The write tools, which ask:

- `ashby_create_candidate` adds a candidate record that everyone with access to candidates sees.
- `ashby_consider_candidate_for_job` adds a candidate to a job's pipeline at its first stage, which the job's hiring
  team sees. The first stage's automatic activities run, and some organisations email candidates there.
- `ashby_add_note_to_candidate` adds a note, or a reply to one, to the candidate's profile. Ashby may hold it as a
  draft for you to confirm; once saved, everyone with access to the profile sees it, and a mentioned colleague is
  notified.

The last two rules turn tools off:

- `ashby_change_application_stage` moves an application to another stage, or archives it. Archiving runs the Archived
  stage's automatic activities, so the candidate still gets any automated archive email; that can't be taken back.
- `ashby_submit_mcp_feedback` sends text to Ashby's team. Ashby invites it whenever something doesn't work, so a model
  could send it unasked, and text written after a failed lookup could carry candidate data.

To turn one on, add a rule that makes it ask to the agent's own `permissions`, which come after the plugin's block in
that agent. Each call then asks. For the build agent:

```json
{
  "agents": {
    "build": {
      "permissions": [
        { "action": "ashby_change_application_stage", "resource": "*", "effect": "ask" },
        { "action": "ashby_submit_mcp_feedback", "resource": "*", "effect": "ask" }
      ]
    }
  }
}
```

Don't put these in the top-level `permissions`: a top-level rule comes after every agent's own rules, so it would
reach every agent, Explore included, which otherwise can't use Ashby. For an agent that exists only in your config, put
them after the plugin's block (see [Agents that miss the rules](#agents-that-miss-the-rules)).

Use only the rules you need. Never make a denied tool `allow`, and don't answer "Always allow" when it asks: OpenCode
would save an allow for every agent in the project, and every later stage move or archive would run unasked.

OpenCode uses the last rule that matches, so everything after the plugin's rules wins:

1. the agent's own rules, such as Explore's, which turn Ashby off there;
2. your top-level `permissions`, which OpenCode adds to every agent;
3. your saved "Always allow" answers, which beat an `ask` but never a configured `deny`.

A `deny` on resource `*` also hides the tool from the model. In an unattended run such as `opencode run`, a tool that
asks is refused. An agent without the base rule gets no Ashby rules and keeps its own behaviour.

### Recipes

A `deny` can go in the top-level `permissions` of `opencode.json`: it applies to every agent, and only tightens. An
`allow` or `ask` goes in the agent's own `permissions`: a top-level one would reach every agent, Explore included.

Never create candidates, in any agent (a `deny` also hides the tool):

```json
[{ "action": "ashby_create_candidate", "resource": "*", "effect": "deny" }]
```

Every write asks, and no recipe removes that. An `allow` rule, or one "Always allow" answer, would let a change that
reaches candidates and the hiring team run without a prompt, in every agent of the project. In an unattended run, run
the write from an interactive session instead.

A strict agent where every Ashby tool asks, reads included: put these in that agent's own `permissions`, after the
block. The last match wins, so the `ashby_*` ask alone would turn the two denied tools into asks too; repeating their
denies after it keeps them off:

```json
[
  { "action": "ashby_*", "resource": "*", "effect": "ask" },
  { "action": "ashby_change_application_stage", "resource": "*", "effect": "deny" },
  { "action": "ashby_submit_mcp_feedback", "resource": "*", "effect": "deny" }
]
```

### Agents that miss the rules

OpenCode creates agents that exist only in your config after plugins add their rules, so those agents get no Ashby
rules; agents that a later plugin adds are in the same position. An agent counts as guarded when the plugin's whole
block appears anywhere after its base allow. `/ashby-status` and `/ashby` list every other agent that has a base allow
and where a new Ashby tool would run without asking, by name, followed by the default rules to paste. The next step
reads:

```text
Put the default rules shown by /ashby-status first in each listed agent's own permissions, in opencode.json or the agent's Markdown file, followed by your top-level rules for Ashby tools.
```

Put the block first in that agent's own `permissions`, then repeat after it any top-level rules you have for `ashby_*`
tools, so yours keep winning. Never put the block in the top-level `permissions`: top-level rules come after every
agent's own rules, so it would loosen Explore. For an agent `reviewer`, with one top-level rule of your own:

```json
{
  "permissions": [{ "action": "ashby_create_candidate", "resource": "*", "effect": "deny" }],
  "agents": {
    "reviewer": {
      "description": "Reviews changes",
      "mode": "subagent",
      "permissions": [
        { "action": "ashby_*", "resource": "*", "effect": "ask" },
        { "action": "ashby_describe_object_fields", "resource": "*", "effect": "allow" },
        { "action": "ashby_get_pending_tasks", "resource": "*", "effect": "allow" },
        { "action": "ashby_create_candidate", "resource": "*", "effect": "deny" }
      ]
    }
  }
}
```

Copy the full block from your own `/ashby-status` output: the sample above keeps the first two read allows and your own
rule, and leaves out the other ten.

## Errors

Every error from the plugin reads `CODE: What happened. Next step: What to do.`

| Code | When | Next step |
| --- | --- | --- |
| `OPTIONS_INVALID` | Setup: an option is unknown or has a wrong value. `/plugins` shows the message, which names the option and the accepted values. | Fix the plugin options in `opencode.json`. |
| `HOST_UNTESTED` | Setup: OpenCode is outside `>=2.2.3 <2.3.0`, and `allowUntestedHost` is not set. | Use OpenCode `>=2.2.3 <2.3.0`, or set `"allowUntestedHost": true`. |
| `STATUS_UNAVAILABLE` | `/ashby-status`, `/ashby` or the status RPC: the status could not be read, or the plugin is not running on the server. The RPC answers with its error `unavailable`. | The message's own next step: restart OpenCode and run the command again, or, when the plugin is not running, run `/plugins` to see why. |
| `SKILLS_INVALID` | Setup: a skill file is missing or broken. The plugin still starts; status shows the problem. | Reinstall the plugin. |
| `SERVER_NOT_REGISTERED` | Setup: the `ashby` server could not be registered. Status shows the problem. | Restart OpenCode. |
| `RULES_NOT_ADDED` | Setup: the default permission rules could not be added, so Ashby tools may run without asking. Status shows the problem. | Restart OpenCode. |

For example:

```text
OPTIONS_INVALID: Unknown option "apiKey". Accepted options: "allowUntestedHost". Next step: Fix the plugin options in opencode.json, for example "plugins": [{ "package": "@joe-broadhead/opencode-ashby", "options": { "allowUntestedHost": true } }].
```

Errors from Ashby's server and from OpenCode pass through unchanged, except in the tools RPC for scripts, whose codes
are in [Scripting](scripting.md#errors).

## Status and RPC

`/ashby-status`, the `/ashby` dialog and the RPC method `status` (RPC ID `ashby.recruiting`) share one status
model. It holds no token, no header and no URL query, and makes no Ashby call. `version`, `host`, `state`,
`unguardedAgents` and `nextStep` are the fields every plugin of this family shares, with the same names and meanings:

| Field | Content |
| --- | --- |
| `version` | The plugin's version |
| `state` | `connected`, `sign_in_required`, `connecting`, `disabled`, `failed`, `not_configured` or `conflict`. The `Connection` row shows the same states as `connected`, `sign-in required`, `connecting`, `disabled`, `failed`, `not configured` and `conflict`. |
| `error` | For a failed connection only: OpenCode's reason, on one line of at most 160 characters, with any URL cut before its query. The text for a needed sign-in can hold an authorization URL, so it is never shown. |
| `source` | `type` (`plugin`, `adopted` or `conflict`), `url`, `signIn` (`oauth`, or `own` for your own entry with `"oauth": false`), and for a conflict the `expected` URL |
| `account` | The name OpenCode keeps on the active sign-in, on one line of at most 80 characters; absent when it keeps none. Ashby's MCP has no account tool, so the plugin learns nothing else about the account. |
| `tools` | How many Ashby tools OpenCode lists that the default rules let run or ask: the listed ones, without the denied ones |
| `deniedTools` | The listed tools that the default rules deny, such as `submit_mcp_feedback`. The `Tools` row shows them as "off by default"; your own later `ask` rule may have turned one on. |
| `listing` | True while a server that connected moments ago lists no tools yet. The next step is then to run `/ashby-status` again in a few seconds, not to ask an admin. |
| `unknownCount`, `unknownTools` | How many of them the plugin does not know, and at most 20 of their names, only those made of lowercase letters, digits and `_` |
| `unguardedAgents` | Agents where a new Ashby tool would run without asking; empty when there are none. An agent whose own rules already ask or deny for every Ashby tool is not listed. |
| `shadowedSkills` | Present only when a skill with one of the plugin's ids, such as your own `ashby` skill, replaces the plugin's: each `id` and the `path` OpenCode loads instead |
| `host` | `version` (`null` if OpenCode reports none), `range` (the supported range) and `tested` (true only for 2.2.3, 2.2.4 and 2.2.5) |
| `problems` | Setup problems, each `CODE: What happened. Next step: What to do.` |
| `nextStep` | Exactly one next step: the `Next step` row, `Nothing to do.` when nothing is needed |

The `Access` row states the posture the default rules fix, from the tool lists: "reads run without asking; the 3 writes
ask first; change_application_stage and submit_mcp_feedback are off". Then it says whether those rules are in place:
"no agent runs new Ashby tools unasked", "default rules missing in the agents listed below", or "default rules not
added (see the OpenCode row)".

When the status cannot be read, the method answers with its error `unavailable`: the message
`STATUS_UNAVAILABLE: Could not read Ashby's status (…).` and `data: { nextStep }`.

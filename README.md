# Ashby for OpenCode

Find and read your Ashby candidates, pipeline, interviews and feedback from OpenCode, and add a candidate, a note or
a pipeline entry, through Ashby's official MCP server. Every tool is allowed by default; the `access` option can make
each change ask first, or deny it.

Unofficial; not affiliated with Ashby.

## Requirements

- OpenCode `>=2.2.3 <2.3.0`, tested on 2.2.3, 2.2.4, 2.2.5 and 2.2.6. Outside that range the plugin does not start, unless
  you set `allowUntestedHost`.
- macOS or Linux, and a browser for the sign-in.
- An Ashby organisation on any plan except Analytics-only.
- An Org Admin has turned on **MCP Server** (Admin > Organization Setup > Opt-In Features).
- Your Ashby user has **Elevated Access**. What you can read and change follows your Ashby access roles: offers need
  Org Admin or Admin - Private, moving or archiving a candidate needs Hiring Manager or higher, and confidential jobs
  stay hidden unless you were granted them.
- Ashby's MCP server is in beta, and Ashby may change its tools without notice. A tool Ashby adds is allowed at once
  under `access: "all"`, and is counted as unknown until a release knows it.
- The 12 read, 3 write and 2 destructive tools, and their classes, come from Ashby's own help page and a signed-in
  server's tool list, which gives no annotations: treat a class as Ashby's description of the tool, not as its annotation. A tool Ashby adds follows
  `access`: allowed at once at `"all"`, asked for at `"ask-changes"`, denied at `"read-only"`, and status names it as
  unknown.
- Ashby stores and processes its data in the United States.

## Install

```sh
opencode plugin add github:joe-broadhead/opencode-ashby#v0.0.0
```

Run `opencode reload`, or restart OpenCode. Then run `/ashby-status`: it shows `sign-in required` until you sign in
(see [Sign in](#sign-in)).

Each release has its own tag, and a Git install does not update by itself. To move to a newer release, remove the old entry with `opencode plugin remove github:joe-broadhead/opencode-ashby#v0.0.0`, then add the new tag with `opencode plugin add github:joe-broadhead/opencode-ashby#v<version>`.

Or add the plugin to `opencode.json` instead, with the same spec:

```json
{ "plugins": [{ "package": "github:joe-broadhead/opencode-ashby#v0.0.0" }] }
```

The plugin registers Ashby's MCP server under the name `ashby`, adds default permission rules, the `/ashby-status`
command, the `/ashby` status view and two skills. Every tool is Ashby's, and OpenCode handles the connection, the
sign-in and the stored credentials.

The install takes the GitHub release tag. Its commit carries the built `dist/`, so the install runs no build.
A new release is a new tag: install it with its own `#v<version>` spec.

## Sign in

Run `/connect` and choose **Ashby** (it is listed under MCP). In the terminal UI, press `o` or Enter to open the link
to Ashby's sign-in page in your browser, sign in with your Ashby account, and approve the access. No API key is needed
or used.

From a terminal, run `opencode mcp auth ashby` instead, in the project folder where the plugin is installed; it opens
the link automatically. `/mcps` also offers the same sign-in.

If either command answers `MCP server not found: ashby`, OpenCode is still opening that folder: wait a few seconds and
run it again.

When the sign-in expires and cannot be renewed, `/connect` marks the Ashby account as needing a new sign-in while the
account is still listed, and OpenCode shows its "MCP server needs authentication" notice; if OpenCode has removed the
account, `/connect` offers the sign-in again.

To sign out, or to switch account, run `opencode mcp logout ashby` from the project folder where the plugin is
installed, or remove the account in `/connect` → Ashby. If it answers `MCP server not found: ashby`, OpenCode is still
opening that folder: wait a few seconds and run it again. Then sign in again. To sign out before you remove the plugin, see [Uninstall](#uninstall).

## Use

Ask, for example:

- "Where is the candidate for the backend role in the process?"
- "What are my interviews this week?"
- "Prep me for my next interview."
- "What do I owe in Ashby?"
- "Show me the pipeline for the data engineer jobs."
- "How do I set up an approval chain in Ashby?"

The model never makes a hiring decision you didn't ask for, labels Ashby's AI output as Ashby's, and keeps candidate
data out of other tools unless you name the destination. What candidates said in interviews comes from Metaview when
its plugin is connected; Ashby answers for the pipeline, applications, jobs and records.

| Command | What it does |
| --- | --- |
| `/ashby-status` | Posts the status report into the session: connection, account, access, tools, agents without the default rules, the OpenCode check and the next step. The model can read it too. |
| `/ashby`, or "Ashby: Status" in the command palette | Opens the same report in a dialog. Press `r` to refresh it and `Esc` to close it. It also refreshes when Ashby's connection, the sign-in or the agents change. |

Ashby's MCP has no account tool, so the Account row shows the name OpenCode keeps on the sign-in, if it has one. The
plugin makes no Ashby call of its own.

Two skills teach the model to use Ashby well:

- `ashby`: finding a candidate, job or application, filters and counts, interview prep, what you owe, citing records,
  and the rules for candidate data.
- `ashby-write`: whom each change reaches (candidates and the hiring team), saying so before the call, and leaving the
  yes to OpenCode's permission prompt.

### Scripts

A script or a cron job can call every known Ashby tool with no model, through `opencode api`. It runs as a session
and its agent, under that agent's permission rules and the session's own. Only a rule that resolves to `allow` runs: a
write included, runs under the default rules; a session that restricts with `ask-changes` or `read-only` needs an
explicit `allow` for the method in the session's or the agent's rules. An `ask` is refused before anything reaches
Ashby, and a saved "Always allow" does not authorise a script.

```sh
opencode api post /api/rpc/ashby.recruiting.tools/get_pending_tasks \
  -H "x-opencode-directory:$PWD" \
  -d '{"input":{"sessionID":"ses_…","input":{"reason":"list my pending Ashby tasks"}}}'
```

See [Scripting](https://github.com/joe-broadhead/opencode-ashby/blob/HEAD/docs/scripting.md).

## Permissions

**Every tool is allowed by default.** The plugin adds one block to every agent, right after the agent's base rule that
allows everything, and that block allows Ashby's tools: reads, writes, stage moves and feedback to Ashby's team alike.
An agent can therefore create a candidate, add a note, or move an application without a prompt. `/ashby` and
`/ashby-status` show the block, the access value and the tools involved.

There are three ways to restrict it.

### 1. The `access` option

```json
{
  "plugins": [
    { "package": "github:joe-broadhead/opencode-ashby#v0.0.0", "options": { "access": "ask-changes" } }
  ]
}
```

| `access` | What runs |
| --- | --- |
| `all` (the default) | every Ashby tool runs without a prompt |
| `ask-changes` | a read runs; every other tool asks, including one Ashby adds later |
| `read-only` | a read runs; every other tool is denied, and hidden from the model |

The block is generated from the tool table and the value, so `/ashby` always shows what is in force. The three
blocks:

#### `all` (the default)

The plugin adds these rules for `access: "all"`:

```json
[
    { "action": "ashby_*", "resource": "*", "effect": "allow" },
    { "action": "ashby_describe_object_fields", "resource": "*", "effect": "allow" },
    { "action": "ashby_filter_records", "resource": "*", "effect": "allow" },
    { "action": "ashby_get_candidate", "resource": "*", "effect": "allow" },
    { "action": "ashby_get_interview_details", "resource": "*", "effect": "allow" },
    { "action": "ashby_get_interview_plan", "resource": "*", "effect": "allow" },
    { "action": "ashby_get_job_pipeline", "resource": "*", "effect": "allow" },
    { "action": "ashby_get_pending_tasks", "resource": "*", "effect": "allow" },
    { "action": "ashby_get_record_details", "resource": "*", "effect": "allow" },
    { "action": "ashby_get_submitted_feedback", "resource": "*", "effect": "allow" },
    { "action": "ashby_list_interviews", "resource": "*", "effect": "allow" },
    { "action": "ashby_search_product_docs", "resource": "*", "effect": "allow" },
    { "action": "ashby_search_records_by_name", "resource": "*", "effect": "allow" },
    { "action": "ashby_add_note_to_candidate", "resource": "*", "effect": "allow" },
    { "action": "ashby_consider_candidate_for_job", "resource": "*", "effect": "allow" },
    { "action": "ashby_create_candidate", "resource": "*", "effect": "allow" },
    { "action": "ashby_change_application_stage", "resource": "*", "effect": "allow" },
    { "action": "ashby_submit_mcp_feedback", "resource": "*", "effect": "allow" }
]
```

#### `ask-changes`

The plugin adds these rules for `access: "ask-changes"`:

```json
[
    { "action": "ashby_*", "resource": "*", "effect": "ask" },
    { "action": "ashby_describe_object_fields", "resource": "*", "effect": "allow" },
    { "action": "ashby_filter_records", "resource": "*", "effect": "allow" },
    { "action": "ashby_get_candidate", "resource": "*", "effect": "allow" },
    { "action": "ashby_get_interview_details", "resource": "*", "effect": "allow" },
    { "action": "ashby_get_interview_plan", "resource": "*", "effect": "allow" },
    { "action": "ashby_get_job_pipeline", "resource": "*", "effect": "allow" },
    { "action": "ashby_get_pending_tasks", "resource": "*", "effect": "allow" },
    { "action": "ashby_get_record_details", "resource": "*", "effect": "allow" },
    { "action": "ashby_get_submitted_feedback", "resource": "*", "effect": "allow" },
    { "action": "ashby_list_interviews", "resource": "*", "effect": "allow" },
    { "action": "ashby_search_product_docs", "resource": "*", "effect": "allow" },
    { "action": "ashby_search_records_by_name", "resource": "*", "effect": "allow" },
    { "action": "ashby_add_note_to_candidate", "resource": "*", "effect": "ask" },
    { "action": "ashby_consider_candidate_for_job", "resource": "*", "effect": "ask" },
    { "action": "ashby_create_candidate", "resource": "*", "effect": "ask" },
    { "action": "ashby_change_application_stage", "resource": "*", "effect": "ask" },
    { "action": "ashby_submit_mcp_feedback", "resource": "*", "effect": "ask" }
]
```

#### `read-only`

The plugin adds these rules for `access: "read-only"`:

```json
[
    { "action": "ashby_*", "resource": "*", "effect": "deny" },
    { "action": "ashby_describe_object_fields", "resource": "*", "effect": "allow" },
    { "action": "ashby_filter_records", "resource": "*", "effect": "allow" },
    { "action": "ashby_get_candidate", "resource": "*", "effect": "allow" },
    { "action": "ashby_get_interview_details", "resource": "*", "effect": "allow" },
    { "action": "ashby_get_interview_plan", "resource": "*", "effect": "allow" },
    { "action": "ashby_get_job_pipeline", "resource": "*", "effect": "allow" },
    { "action": "ashby_get_pending_tasks", "resource": "*", "effect": "allow" },
    { "action": "ashby_get_record_details", "resource": "*", "effect": "allow" },
    { "action": "ashby_get_submitted_feedback", "resource": "*", "effect": "allow" },
    { "action": "ashby_list_interviews", "resource": "*", "effect": "allow" },
    { "action": "ashby_search_product_docs", "resource": "*", "effect": "allow" },
    { "action": "ashby_search_records_by_name", "resource": "*", "effect": "allow" },
    { "action": "ashby_add_note_to_candidate", "resource": "*", "effect": "deny" },
    { "action": "ashby_consider_candidate_for_job", "resource": "*", "effect": "deny" },
    { "action": "ashby_create_candidate", "resource": "*", "effect": "deny" },
    { "action": "ashby_change_application_stage", "resource": "*", "effect": "deny" },
    { "action": "ashby_submit_mcp_feedback", "resource": "*", "effect": "deny" }
]
```

### 2. An agent's own rules

A rule in an agent's own `permissions` comes after the plugin's block, so it wins for that agent. A read-only agent
that keeps Ashby's reads and asks for one change:

```json
{
  "agents": {
    "build": {
      "permissions": [
        { "action": "ashby_*", "resource": "*", "effect": "ask" },
        { "action": "ashby_get_candidate", "resource": "*", "effect": "allow" },
        { "action": "ashby_get_job_pipeline", "resource": "*", "effect": "allow" },
        { "action": "ashby_add_note_to_candidate", "resource": "*", "effect": "ask" }
      ]
    }
  }
}
```

### 3. A per-tool rule

Every action is `ashby_` followed by the tool's name. A later rule wins, so this denies one tool in the top-level
`permissions`, for every agent:

```json
{
  "permissions": [
    { "action": "ashby_change_application_stage", "resource": "*", "effect": "deny" }
  ]
}
```

`ashby_change_application_stage` moves an application to another stage, or archives it: archiving runs the Archived
stage's automatic activities, so the candidate still gets any automated archive email. `ashby_submit_mcp_feedback`
sends text to Ashby's team.

### What each change reaches

Say what a change does and whom it reaches before you make it. These change people's records:

- `ashby_create_candidate`: a new candidate record that everyone with access to candidates sees.
- `ashby_consider_candidate_for_job`: adds the candidate to a job's pipeline, which its hiring team sees. If the job's
  first stage has an automatic email, Ashby sends it to the candidate, and the tool cannot stop it.
- `ashby_add_note_to_candidate`: a note, or a reply, on the candidate's profile. It saves at once, since the tool has no
  draft option. Everyone with access to the profile sees it; people following the candidate may be notified, and so may
  a colleague you @-mention.

Everything that comes later than these rules still wins: an agent's own stricter rules (Explore cannot use Ashby),
your `permissions` in `opencode.json`, and your saved "Always allow" answers.

Agents that exist only in your own config, and agents added by plugins that load later, are created after the plugin
adds its rules, so they get no block. With `access: "all"` that changes nothing; with `ask-changes` or `read-only` they
stay unrestricted, and `/ashby-status` and `/ashby` name them with the block to put first in each one's own
`permissions`. Do not put an `ask` or an `allow` in the top-level `permissions`, which would loosen Explore.

## Configure

Set options with the object form of the plugin entry:

```json
{
  "plugins": [{ "package": "github:joe-broadhead/opencode-ashby#v0.0.0", "options": { "allowUntestedHost": true } }]
}
```

| Option | Values | Default | Effect |
| --- | --- | --- | --- |
| `allowUntestedHost` | `true` or `false` | `false` | Starts on an OpenCode version outside `>=2.2.3 <2.3.0`, with a warning in status. |

[docs/configuration.md](https://github.com/joe-broadhead/opencode-ashby/blob/HEAD/docs/configuration.md) has the
details, including your own `mcp.servers.ashby` entry, permission recipes and every error.

## Organisation rollout

OpenCode registers itself with Ashby's sign-in server on first use, so there is no client ID or key to distribute. Put
the plugin entry in the system config: `/Library/Application Support/opencode/opencode.json` on macOS, or
`/etc/opencode/opencode.json` on Linux. This example also turns off candidate creation, for everyone:

```json
{
  "plugins": [{ "package": "github:joe-broadhead/opencode-ashby#v0.0.0" }],
  "permissions": [{ "action": "ashby_create_candidate", "resource": "*", "effect": "deny" }]
}
```

To let users move or archive candidates from OpenCode, with a prompt on every call, add the `ask` rule for
`ashby_change_application_stage` to the agent's own `permissions` in the same config, as [Permissions](#permissions)
shows for `agents.build`. Not to the top-level `permissions`, which reach every agent, Explore included.

Members then only sign in: run `/connect` and choose Ashby, then press `o` or Enter to open the link. Ashby's own
controls stay in Ashby: the **MCP Server** opt-in feature, and each user's access roles. Under Ashby's terms, your
organisation decides on third-party integrations and answers for them, and its approval of AI tools applies to
candidate data.

## Troubleshooting

Run `/ashby-status` first. Its last line is the next step.

| Status or error | What to do |
| --- | --- |
| Connection: sign-in required | Run `/connect` and choose Ashby, then press `o` or Enter to open the link. In a terminal, `opencode mcp auth ashby` opens it automatically: run it from the project folder, and if it answers `MCP server not found: ashby`, wait a few seconds and run it again. |
| Connection: connecting | Wait a few seconds, then run `/ashby-status` again. |
| Connection: failed | Check your network, then run `/ashby-status` again. With your own `mcp.servers.ashby` that has `"oauth": false`, remove that line: Ashby's server signs in only with OAuth. |
| Connection: disabled | Enable `ashby` in `/mcps`, or remove `"disabled": true` from `mcp.servers.ashby` in `opencode.json`. |
| Connection: not configured | An organisation policy (`mcp.use`) or another plugin removes the `ashby` server. Ask your administrator, then restart OpenCode. |
| Connection: conflict | Your config has an `mcp.servers.ashby` entry with a URL other than `https://mcp.ashbyhq.com/mcp/v1`. Point it at `https://mcp.ashbyhq.com/mcp/v1` or remove it, then restart OpenCode. |
| Ashby refuses the sign-in | An Org Admin must turn on **MCP Server** (Admin > Organization Setup > Opt-In Features), and your user needs **Elevated Access**. |
| Tools: none listed yet | Ashby connected moments ago and is still listing its tools. Run `/ashby-status` again, or press `r` in the dialog, in a few seconds. |
| Tools: 0 available | Ashby lists no tools for your account. Ask an Org Admin to turn on **MCP Server**, and to give you **Elevated Access**. |
| Tools: a tool Ashby adds | Every tool is allowed by default, so it runs at once. See [Permissions](#permissions) to restrict it. |
| Tools: unknown | Ashby added tools the plugin does not know yet. They follow `access`: allowed at `"all"`, asked for at `"ask-changes"`, denied at `"read-only"`. A known tool missing from the count is normal: Ashby may list fewer tools for less access. |
| Access: default rules missing or not added | Some agents lack the default rules (see the agents row), or OpenCode could not add them (see the OpenCode row). Follow the next step. |
| Account: account name not reported | Nothing is wrong: Ashby's MCP has no account tool, and OpenCode keeps no name on this sign-in. Ashby's answers follow the user you signed in as. |
| Answers miss jobs or candidates | Ashby returns only what your access roles allow, and confidential jobs stay hidden unless you were granted them. Ask an Ashby admin for access. |
| Rate limited | Ashby allows 120 requests a minute per sign-in. Wait a minute, and make fewer calls at once. |
| A move or archive asks | Only under `access: "ask-changes"`; the default lets it run. See [Permissions](#permissions) for the three values. |
| Agents without default rules | Put the default rules shown by `/ashby-status` first in each listed agent's own permissions, in `opencode.json` or the agent's Markdown file, followed by your top-level rules for Ashby tools. |
| OpenCode: untested | OpenCode is not 2.2.3, 2.2.4, 2.2.5 or 2.2.6. Inside `>=2.2.3 <2.3.0` the plugin runs normally; outside it, it runs only because `allowUntestedHost` is set. If Ashby misbehaves, use a tested release. |
| Signed in to the wrong Ashby account | Run `opencode mcp logout ashby` from the project folder (or remove the account in `/connect` → Ashby); if it answers `MCP server not found: ashby`, wait a few seconds and run it again. Then sign in again. |
| Asked to sign in again after about an hour | Ashby may issue no refresh token, so the sign-in cannot be renewed. Sign in again with `/connect` → Ashby; your Ashby session may still be open in the browser. |
| An Ashby tool is refused in `opencode run` | Nobody could answer its prompt, so the session's own rules asked for the call. Under `access: "all"` (the default) nothing asks. |
| A skill seems ignored, and status names a skill to rename or move | A skill of yours with the same id, such as `ashby`, replaces the plugin's. Rename or move it. |
| `/ashby` is missing | The plugin did not start. Run `/plugins` to see the error. |
| An error code such as `OPTIONS_INVALID` | See [Errors](#errors) for the code, where it comes from and what to do. |

## Errors

Every error reads `CODE: What happened. Next step: What to do.` The codes are the plugin's own one table. `setup` and
`status` codes come from the plugin; `rpc` codes are a refusal from the tools RPC for scripts, which
[Scripting](https://github.com/joe-broadhead/opencode-ashby/blob/HEAD/docs/scripting.md#errors) explains in detail.

| Code | Surface | When |
| --- | --- | --- |
| `HOST_UNTESTED` | setup | OpenCode is outside the supported range and `allowUntestedHost` is not set. |
| `OPTIONS_INVALID` | setup | An option is unknown or has a wrong value. |
| `SKILLS_INVALID` | setup | A skill file is missing or broken; the plugin still starts. |
| `SERVER_NOT_REGISTERED` | setup | The `ashby` server could not be registered. |
| `RULES_NOT_ADDED` | setup | The default permission rules could not be added. |
| `STATUS_UNAVAILABLE` | status | The status could not be read, or the plugin is not running. |
| `SESSION_UNKNOWN` | rpc | The session does not exist in this location. |
| `SESSION_AGENT_REQUIRED` | rpc | The session names no agent, or one that does not exist. |
| `PERMISSION_DENIED` | rpc | The last matching rule is an `ask` or a `deny`; refused before dispatch. |
| `SERVER_CONFLICT` | rpc | `mcp.servers.ashby` is defined at another URL. |
| `AUTH_REQUIRED` | rpc | The `ashby` server needs a sign-in. |
| `CONNECTING` | rpc | The `ashby` server is still connecting. |
| `CONNECTION_FAILED` | rpc | The `ashby` server could not connect. |
| `DISABLED` | rpc | The `ashby` server is disabled. |
| `NOT_REGISTERED` | rpc | The `ashby` server is not registered. |
| `TOOL_UNAVAILABLE` | rpc | The server is connected but OpenCode does not list the tool. |
| `UPSTREAM_ERROR` | rpc | Ashby answered with an error, such as an invalid input or a rate limit. |
| `CANCELLED` | rpc | The request was cancelled. |

The status RPC's own error is `unavailable`, with a next step, when the status cannot be read.

## Known limits

- **The tool table comes from Ashby's help page.** Ashby publishes no annotations, so a class is a judgement from
  Ashby's description of the tool. A tool Ashby adds is allowed at once and counted as unknown; a tool Ashby marks as
  changing data could run here as a read until a release knows it. The names and parameters match a signed-in server's
  tool list. That list shows no annotations, so `npm run drift` compares a saved list with the table, and
  `CONTRIBUTING.md` has the steps.
- **A script's read can cross projects.** A script's session may belong to another directory than the OpenCode server
  answering it, and the read then runs under the serving location's agent rules; only a `deny` is refused in between.
  Run scripts in the project whose agent you mean. This is in the module shared with the other plugins, not in this
  one.
- **In Jelly, a tool Ashby adds is not asked about.** Jelly applies each declared tool's effect and nothing else, so an
  undeclared tool, a write included, runs without asking until a release of this plugin declares it. A Jelly admin can
  set it to ask.

- Updates are not automatic for a Git install, and `opencode plugin update` and `opencode plugin check` do not work on one: to move to a newer release, remove the old entry and add the new tag.

## Uninstall

Sign out while the plugin is still installed: once it is removed, OpenCode no longer knows the `ashby` server, so
`opencode mcp logout ashby` fails with `MCP server not found: ashby` and the sign-in stays in OpenCode's credential
store.

1. Sign out: `opencode mcp logout ashby` from the project folder where the plugin is installed, or remove the account
   in `/connect` → Ashby. If it answers `MCP server not found: ashby`, OpenCode is still opening that folder: wait a
   few seconds and run it again.
2. Check: `opencode auth list` no longer lists **Ashby**.
3. Remove the plugin: `opencode plugin remove github:joe-broadhead/opencode-ashby#v0.0.0`, then `opencode reload`.
   `opencode mcp list` no longer lists `ashby`.
4. Remove any Ashby rules you copied into your agents' own `permissions`.

An Org Admin can also turn off **MCP Server** for the whole organisation.

## Links

- [Configuration](https://github.com/joe-broadhead/opencode-ashby/blob/HEAD/docs/configuration.md)
- [Scripting](https://github.com/joe-broadhead/opencode-ashby/blob/HEAD/docs/scripting.md)
- [In Jelly](https://github.com/joe-broadhead/opencode-ashby/blob/HEAD/docs/jelly.md)
- [Architecture](https://github.com/joe-broadhead/opencode-ashby/blob/HEAD/docs/architecture.md)
- [Contributing](https://github.com/joe-broadhead/opencode-ashby/blob/HEAD/CONTRIBUTING.md)
- [Security](https://github.com/joe-broadhead/opencode-ashby/blob/HEAD/SECURITY.md)
- [Changelog](https://github.com/joe-broadhead/opencode-ashby/blob/HEAD/CHANGELOG.md)
- [MIT license](https://github.com/joe-broadhead/opencode-ashby/blob/HEAD/LICENSE)
- [Ashby's MCP server](https://docs.ashbyhq.com/ashby-mcp-server-beta)

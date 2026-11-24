# Ashby for OpenCode

Find and read your Ashby candidates, pipeline, interviews and feedback from OpenCode, and make selected changes,
through Ashby's official MCP server. Every tool is allowed by default; the `access` option can make each change ask
first, or deny it.

Unofficial; not affiliated with Ashby. Ashby is a trademark of Ashby, Inc.; this unofficial plugin is not endorsed by
them.

## Requirements

- OpenCode `>=2.4.1 <2.5.0`, tested on 2.4.1. Outside that range the plugin does not start, unless you set
  `allowUntestedHost`.
- macOS or Linux, and a browser for the sign-in.
- An Ashby organisation on any plan except Analytics-only.
- An Org Admin has turned on **MCP Server** (Admin > Organization Setup > Opt-In Features).
- Your Ashby user has **Elevated Access**. What you can read and change follows your Ashby access roles: offers need
  Org Admin or Admin - Private, moving or archiving a candidate needs Hiring Manager or higher, and confidential jobs
  stay hidden unless you were granted them.
- Ashby's MCP server is in beta, and Ashby may change its tools without notice. A tool Ashby adds is allowed at once
  under `access: "all"`, and is counted as unknown until a release knows it.
- Ashby stores and processes its data in the United States.

## Install

Install from a release:

```sh
opencode plugin add github:we-the-rebel-alliance/ashby-plugin#v<version>
```

The first release on plugin-contract is `v0.0.0` (phase 4b). Install only from a release tag: there is no untagged
install and no `master` install.

Run `opencode reload`, or restart OpenCode. Then run `/ashby-status`: it shows `sign-in required` until you sign in
(see [Sign in](#sign-in)).

Each release has its own tag, and a Git install does not update by itself. To move to a newer release, remove the old
entry and add the new tag.

Or add the plugin to `opencode.json` instead, with the same spec:

```json
{ "plugins": [{ "package": "github:we-the-rebel-alliance/ashby-plugin#v<version>" }] }
```

The plugin registers Ashby's MCP server under the name `ashby`, adds default permission rules, the `/ashby-status`
command, the `/ashby` status view and two skills. OpenCode handles the connection, the sign-in and the stored
credentials.

## Sign in

Run `/connect` and choose **Ashby** (it is listed under MCP). In the terminal UI, press `o` or Enter to open the link
to Ashby's sign-in page in your browser, sign in with your Ashby account, and approve the access. No API key is needed
or used.

From a terminal, run `opencode mcp auth ashby` instead, in the project folder where the plugin is installed; it opens
the link automatically. `/mcps` also offers the same sign-in.

If either command answers `MCP server not found: ashby`, OpenCode is still opening that folder: wait a few seconds and
run it again.

When the sign-in expires and cannot be renewed, `/connect` marks the Ashby account as needing a new sign-in while the
account is still listed; if OpenCode has removed the account, `/connect` offers the sign-in again.

To sign out, or to switch account, run `opencode mcp logout ashby` from the project folder where the plugin is
installed, or remove the account in `/connect` → Ashby. If it answers `MCP server not found: ashby`, OpenCode is still
opening that folder: wait a few seconds and run it again. Then sign in again.

## Use

Ask, for example:

- "Where is the candidate for the backend role in the process?"
- "What are my interviews this week?"
- "What do I owe in Ashby?"
- "Show me the pipeline for the data engineer jobs."

Two skills teach the model to use Ashby well:

- `ashby`: finding a candidate, job or application, filters and counts, interview prep, what you owe, citing records,
  and the rules for candidate data.
- `ashby-write`: whom each change reaches (candidates and the hiring team), saying so before the call, and leaving the
  yes to OpenCode's permission prompt.

`/ashby-status` posts the status report into the session: connection, account, access, tools, agents without the
default rules, the OpenCode check and the next step. `/ashby`, or "Ashby: Status" in the command palette, opens the
same report in a dialog; press `r` to refresh it and `Esc` to close it.

### Scripts

A script can call every known Ashby tool with no model, through `opencode api`. It runs as a session and its agent,
under that agent's permission rules and the session's own; only a rule that resolves to `allow` runs.

```sh
opencode api post /api/rpc/ashby.recruiting.tools/get_pending_tasks \
  -H "x-opencode-directory:$PWD" \
  -d '{"input":{"sessionID":"ses_…","input":{"reason":"list my pending Ashby tasks"}}}'
```

See [Scripting](https://github.com/we-the-rebel-alliance/ashby-plugin/blob/master/docs/scripting.md).

### The interviews source

The plugin declares one source of the shared source contract, `ashby.interviews`, in `package.json`'s `sources`.
`events_list` lists the interviews Ashby's `list_interviews` returns for your sign-in, oldest first, as metadata only:
an interview once it started 30 minutes ago, never a cancelled one, and never an email, phone number, feedback,
scorecard, note or transcript. `probe` names who is signed in. Both are tools in the `ashby` namespace, Code Mode
entries, and methods of the tools RPC.

## Permissions

**Every tool is allowed by default.** The plugin adds one block to every agent, right after the agent's base rule that
allows everything, and that block allows Ashby's tools: reads and changes alike. `/ashby` and `/ashby-status` show the
block, the access value and the tools involved.

There are three ways to restrict it.

### 1. The `access` option

```json
{
  "plugins": [
    { "package": "github:we-the-rebel-alliance/ashby-plugin#v<version>", "options": { "access": "ask-changes" } }
  ]
}
```

| `access` | What runs |
| --- | --- |
| `all` (the default) | every Ashby tool runs without a prompt |
| `ask-changes` | a read runs; every other tool asks, including one Ashby adds later |
| `read-only` | a read runs; every other tool is denied, and hidden from the model |

The block is generated from the tool table and the value. Its last two rules allow `events_list` and `probe`, the
interviews source's own reads, under every value.

#### `all` (the default)

The plugin adds these rules for `access: "all"`:

```json
[
    { "action": "ashby_*", "resource": "*", "effect": "allow" },
    { "action": "ashby_describe_object_fields", "resource": "*", "effect": "allow" },
    { "action": "ashby_filter_records", "resource": "*", "effect": "allow" },
    { "action": "ashby_get_ai_interviewer_details", "resource": "*", "effect": "allow" },
    { "action": "ashby_get_ai_screening_interview_analytics", "resource": "*", "effect": "allow" },
    { "action": "ashby_get_ai_screening_interview_results", "resource": "*", "effect": "allow" },
    { "action": "ashby_get_candidate", "resource": "*", "effect": "allow" },
    { "action": "ashby_get_interview_details", "resource": "*", "effect": "allow" },
    { "action": "ashby_get_interview_plan", "resource": "*", "effect": "allow" },
    { "action": "ashby_get_job_pipeline", "resource": "*", "effect": "allow" },
    { "action": "ashby_get_pending_tasks", "resource": "*", "effect": "allow" },
    { "action": "ashby_get_record_details", "resource": "*", "effect": "allow" },
    { "action": "ashby_get_submitted_feedback", "resource": "*", "effect": "allow" },
    { "action": "ashby_list_interviews", "resource": "*", "effect": "allow" },
    { "action": "ashby_search_records_by_name", "resource": "*", "effect": "allow" },
    { "action": "ashby_add_note_to_candidate", "resource": "*", "effect": "allow" },
    { "action": "ashby_consider_candidate_for_job", "resource": "*", "effect": "allow" },
    { "action": "ashby_create_ai_interviewer", "resource": "*", "effect": "allow" },
    { "action": "ashby_create_ai_interviewer_version", "resource": "*", "effect": "allow" },
    { "action": "ashby_create_candidate", "resource": "*", "effect": "allow" },
    { "action": "ashby_update_ai_interviewer_outline", "resource": "*", "effect": "allow" },
    { "action": "ashby_change_application_stage", "resource": "*", "effect": "allow" },
    { "action": "ashby_submit_mcp_feedback", "resource": "*", "effect": "allow" },
    { "action": "ashby_events_list", "resource": "*", "effect": "allow" },
    { "action": "ashby_probe", "resource": "*", "effect": "allow" }
]
```

#### `ask-changes`

The plugin adds these rules for `access: "ask-changes"`:

```json
[
    { "action": "ashby_*", "resource": "*", "effect": "ask" },
    { "action": "ashby_describe_object_fields", "resource": "*", "effect": "allow" },
    { "action": "ashby_filter_records", "resource": "*", "effect": "allow" },
    { "action": "ashby_get_ai_interviewer_details", "resource": "*", "effect": "allow" },
    { "action": "ashby_get_ai_screening_interview_analytics", "resource": "*", "effect": "allow" },
    { "action": "ashby_get_ai_screening_interview_results", "resource": "*", "effect": "allow" },
    { "action": "ashby_get_candidate", "resource": "*", "effect": "allow" },
    { "action": "ashby_get_interview_details", "resource": "*", "effect": "allow" },
    { "action": "ashby_get_interview_plan", "resource": "*", "effect": "allow" },
    { "action": "ashby_get_job_pipeline", "resource": "*", "effect": "allow" },
    { "action": "ashby_get_pending_tasks", "resource": "*", "effect": "allow" },
    { "action": "ashby_get_record_details", "resource": "*", "effect": "allow" },
    { "action": "ashby_get_submitted_feedback", "resource": "*", "effect": "allow" },
    { "action": "ashby_list_interviews", "resource": "*", "effect": "allow" },
    { "action": "ashby_search_records_by_name", "resource": "*", "effect": "allow" },
    { "action": "ashby_add_note_to_candidate", "resource": "*", "effect": "ask" },
    { "action": "ashby_consider_candidate_for_job", "resource": "*", "effect": "ask" },
    { "action": "ashby_create_ai_interviewer", "resource": "*", "effect": "ask" },
    { "action": "ashby_create_ai_interviewer_version", "resource": "*", "effect": "ask" },
    { "action": "ashby_create_candidate", "resource": "*", "effect": "ask" },
    { "action": "ashby_update_ai_interviewer_outline", "resource": "*", "effect": "ask" },
    { "action": "ashby_change_application_stage", "resource": "*", "effect": "ask" },
    { "action": "ashby_submit_mcp_feedback", "resource": "*", "effect": "ask" },
    { "action": "ashby_events_list", "resource": "*", "effect": "allow" },
    { "action": "ashby_probe", "resource": "*", "effect": "allow" }
]
```

#### `read-only`

The plugin adds these rules for `access: "read-only"`:

```json
[
    { "action": "ashby_*", "resource": "*", "effect": "deny" },
    { "action": "ashby_describe_object_fields", "resource": "*", "effect": "allow" },
    { "action": "ashby_filter_records", "resource": "*", "effect": "allow" },
    { "action": "ashby_get_ai_interviewer_details", "resource": "*", "effect": "allow" },
    { "action": "ashby_get_ai_screening_interview_analytics", "resource": "*", "effect": "allow" },
    { "action": "ashby_get_ai_screening_interview_results", "resource": "*", "effect": "allow" },
    { "action": "ashby_get_candidate", "resource": "*", "effect": "allow" },
    { "action": "ashby_get_interview_details", "resource": "*", "effect": "allow" },
    { "action": "ashby_get_interview_plan", "resource": "*", "effect": "allow" },
    { "action": "ashby_get_job_pipeline", "resource": "*", "effect": "allow" },
    { "action": "ashby_get_pending_tasks", "resource": "*", "effect": "allow" },
    { "action": "ashby_get_record_details", "resource": "*", "effect": "allow" },
    { "action": "ashby_get_submitted_feedback", "resource": "*", "effect": "allow" },
    { "action": "ashby_list_interviews", "resource": "*", "effect": "allow" },
    { "action": "ashby_search_records_by_name", "resource": "*", "effect": "allow" },
    { "action": "ashby_add_note_to_candidate", "resource": "*", "effect": "deny" },
    { "action": "ashby_consider_candidate_for_job", "resource": "*", "effect": "deny" },
    { "action": "ashby_create_ai_interviewer", "resource": "*", "effect": "deny" },
    { "action": "ashby_create_ai_interviewer_version", "resource": "*", "effect": "deny" },
    { "action": "ashby_create_candidate", "resource": "*", "effect": "deny" },
    { "action": "ashby_update_ai_interviewer_outline", "resource": "*", "effect": "deny" },
    { "action": "ashby_change_application_stage", "resource": "*", "effect": "deny" },
    { "action": "ashby_submit_mcp_feedback", "resource": "*", "effect": "deny" },
    { "action": "ashby_events_list", "resource": "*", "effect": "allow" },
    { "action": "ashby_probe", "resource": "*", "effect": "allow" }
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

### What each change reaches

Say what a change does and whom it reaches before you make it. These change people's records:

- `ashby_create_candidate`: a new candidate record that everyone with access to candidates sees.
- `ashby_consider_candidate_for_job`: adds the candidate to a job's pipeline, which its hiring team sees. If the job's
  first stage has an automatic email, Ashby sends it to the candidate, and the tool cannot stop it.
- `ashby_add_note_to_candidate`: a note, or a reply, on the candidate's profile. It saves at once, since the tool has
  no draft option. Everyone with access to the profile sees it; people following the candidate may be notified, and so
  may a colleague you @-mention.

## Configure

Set options with the object form of the plugin entry:

```json
{
  "plugins": [{ "package": "github:we-the-rebel-alliance/ashby-plugin#v<version>", "options": { "allowUntestedHost": true } }]
}
```

| Option | Values | Default | Effect |
| --- | --- | --- | --- |
| `access` | `"all"`, `"ask-changes"` or `"read-only"` | `"all"` | How much the default rules restrict. |
| `allowUntestedHost` | `true` or `false` | `false` | Starts on an OpenCode version outside `>=2.4.1 <2.5.0`, with a warning in status. |

[docs/configuration.md](https://github.com/we-the-rebel-alliance/ashby-plugin/blob/master/docs/configuration.md) has
the details, including your own `mcp.servers.ashby` entry and every error.

## Errors

Every error reads `CODE: What happened. Next step: What to do.` The codes are the plugin's own one table.

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
| `INPUT_INVALID` | source | `events_list` or `probe` got an input outside its schema, or a cursor without its account. |
| `SOURCE_UNKNOWN` | source | `events_list` or `probe` was asked for a source other than `ashby`. |
| `ACCOUNT_MISMATCH` | source | An account other than `default`, or a cursor issued for another Ashby sign-in. |
| `CURSOR_INVALID` | source | The cursor was not issued by this plugin's `events_list`. |
| `NEEDS_SIGN_IN` | source | OpenCode holds no Ashby sign-in, or the `ashby` server needs one. |
| `RATE_LIMITED` | source | Ashby's `list_interviews` hit Ashby's rate limit. |
| `UNAVAILABLE` | source | `list_interviews` is not available, failed, or answered in a form the plugin does not read. |

The status RPC's own error is `unavailable`, with a next step, when the status cannot be read.

## Known limits

- **The tool table comes from Ashby's help page and a signed-in server's tool list.** A tool Ashby adds is allowed at
  once and counted as unknown; a tool Ashby marks as changing data could run here as a read until a release knows it.
- **`list_interviews` answers may change without notice.** The envelope is confirmed live; one interview's own fields
  are assumed until a live answer that holds one is captured. The source fails rather than guess, so its cursor holds.
- **An interview that shows up late is listed if it started within the last seven days of the cursor.** An interview
  that becomes visible later than that is not listed.
- **Whose interviews is Ashby's call, and the plugin cannot check it.** The source lists what Ashby's
  `list_interviews` returns for your sign-in, and no Ashby tool names the signed-in user.
- **Ashby does not confirm the source's owner.** A page's owner is OpenCode's sign-in for Ashby.
- **A script's read can cross projects.** Run scripts in the project whose agent you mean.
- Updates are not automatic for a Git install: remove the old entry and add the new tag.

## Uninstall

Sign out while the plugin is still installed: once it is removed, OpenCode no longer knows the `ashby` server, so
`opencode mcp logout ashby` fails with `MCP server not found: ashby` and the sign-in stays in OpenCode's credential
store.

1. Sign out: `opencode mcp logout ashby` from the project folder where the plugin is installed, or remove the account
   in `/connect` → Ashby. If it answers `MCP server not found: ashby`, OpenCode is still opening that folder: wait a
   few seconds and run it again.
2. Check: `opencode auth list` no longer lists **Ashby**.
3. Remove the plugin: `opencode plugin remove github:we-the-rebel-alliance/ashby-plugin#v<version>`, then
   `opencode reload`. `opencode mcp list` no longer lists `ashby`.
4. Remove any Ashby rules you copied into your agents' own `permissions`.

## Links

- [Configuration](https://github.com/we-the-rebel-alliance/ashby-plugin/blob/master/docs/configuration.md)
- [Scripting](https://github.com/we-the-rebel-alliance/ashby-plugin/blob/master/docs/scripting.md)
- [Architecture](https://github.com/we-the-rebel-alliance/ashby-plugin/blob/master/docs/architecture.md)
- [Contributing](https://github.com/we-the-rebel-alliance/ashby-plugin/blob/master/CONTRIBUTING.md)
- [Security](https://github.com/we-the-rebel-alliance/ashby-plugin/blob/master/SECURITY.md)
- [Changelog](https://github.com/we-the-rebel-alliance/ashby-plugin/blob/master/CHANGELOG.md)
- [MIT license](https://github.com/we-the-rebel-alliance/ashby-plugin/blob/master/LICENSE)
- [Ashby's MCP server](https://docs.ashbyhq.com/ashby-mcp-server-beta)

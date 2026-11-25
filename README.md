# Ashby

Ashby's own MCP server in OpenCode, with one account per alias. The plugin reads the signed-in user's interviews as
meeting events for automations and collectors, reports status and who is signed in, and passes Ashby's 22 MCP tools
through for agents: find a candidate, read a pipeline, add a note, move an application. Each alias is a separate MCP
server (`ashby`, `ashby-work`, `ashby-personal`), so two accounts never share an OAuth credential, a permission rule or
a cursor.

The plugin holds no credentials and has no runtime dependencies. OpenCode owns sign-in, the MCP transport, permission
prompts and limits; Ashby owns its own tool inputs and results.

## Install

```sh
opencode plugin add github:we-the-rebel-alliance/ashby-plugin#v0.0.1
```

Or in `opencode.json(c)`:

```json
{
  "plugins": [{ "package": "github:we-the-rebel-alliance/ashby-plugin#v0.0.1" }]
}
```

An Org Admin must turn on Ashby's MCP Server (Admin → Organization Setup → Opt-In Features) and give each user
Elevated Access. This is the `v0.0.1` release on
[plugin-contract](https://github.com/we-the-rebel-alliance/plugin-contract).

## Sign in

One account is the server `ashby`. Sign in once, with `/connect` (choose `ashby`) or:

```sh
opencode mcp auth ashby
```

Several accounts are several servers. Add one alias per account:

```json
{
  "plugins": [
    {
      "package": "github:we-the-rebel-alliance/ashby-plugin#v0.0.1",
      "options": { "accounts": { "work": {}, "personal": {} } }
    }
  ]
}
```

That adds `ashby-work` and `ashby-personal`, each with its own OAuth. Sign in to each:

```sh
opencode mcp auth ashby-work
opencode mcp auth ashby-personal
```

`status` lists every alias and its state. `probe({ account })` names the signed-in credential of one alias, which
Ashby does not confirm. With more than one alias, every method that takes an account needs one: leaving it out is
`ACCOUNT_REQUIRED`, and an alias the plugin does not serve is `ACCOUNT_UNKNOWN`.

## Skills

The plugin ships two skills. `ashby` covers reads: a candidate's stage and profile, pipelines and counts, interviews,
feedback and pending tasks. `ashby-write` covers changes: a note, a new candidate, an application stage, an AI screening
draft, feedback to Ashby. OpenCode loads both when the plugin starts. They say when to use the plugin rather than
guess, how to pick an account when several are signed in, and whom a change reaches.

## Access

`access` is the ceiling for the agent rules the plugin generates:

| Level           | Reads | Everything else |
| --------------- | ----- | --------------- |
| `all` (default) | run   | run             |
| `ask-changes`   | run   | ask first       |
| `read-only`     | run   | off             |

The 22 pass-through tools are one rule per alias (`ashby-work_*` for `work`); a rule or grant for one alias never
matches another alias's tools. A person can still add a narrower rule, which wins.

## Options

Every option is optional; [Configuration](docs/configuration.md) has examples.

| Option | Default | Meaning |
|---|---|---|
| `access` | `all` | The ceiling for the generated rules: `all`, `ask-changes` or `read-only`. |
| `accounts` | one `default` account | A map of alias to profile. Each alias is its own Ashby MCP server (`ashby`, `ashby-<alias>`). The profile has no fields. |
| `allowUntestedHost` | `false` | Start outside the tested `>=2.4.1 <2.5.0` range. Leave it `false`; use it for one migration only. |

## Capabilities

<!-- generated:capabilities -->
### Methods

| Method | Class | Accounts | Operations |
|---|---|---|---|
| `status` | read | none | — |
| `events_list` | read | optional | `list_interviews` |
| `probe` | read | optional | — |
| `mcp:add_note_to_candidate` | write | none | `add_note_to_candidate` |
| `mcp:change_application_stage` | send | none | `change_application_stage` |
| `mcp:consider_candidate_for_job` | send | none | `consider_candidate_for_job` |
| `mcp:create_ai_interviewer` | write | none | `create_ai_interviewer` |
| `mcp:create_ai_interviewer_version` | write | none | `create_ai_interviewer_version` |
| `mcp:create_candidate` | write | none | `create_candidate` |
| `mcp:describe_object_fields` | read | none | `describe_object_fields` |
| `mcp:filter_records` | read | none | `filter_records` |
| `mcp:get_ai_interviewer_details` | read | none | `get_ai_interviewer_details` |
| `mcp:get_ai_screening_interview_analytics` | read | none | `get_ai_screening_interview_analytics` |
| `mcp:get_ai_screening_interview_results` | read | none | `get_ai_screening_interview_results` |
| `mcp:get_candidate` | read | none | `get_candidate` |
| `mcp:get_interview_details` | read | none | `get_interview_details` |
| `mcp:get_interview_plan` | read | none | `get_interview_plan` |
| `mcp:get_job_pipeline` | read | none | `get_job_pipeline` |
| `mcp:get_pending_tasks` | read | none | `get_pending_tasks` |
| `mcp:get_record_details` | read | none | `get_record_details` |
| `mcp:get_submitted_feedback` | read | none | `get_submitted_feedback` |
| `mcp:list_interviews` | read | none | `list_interviews` |
| `mcp:search_records_by_name` | read | none | `search_records_by_name` |
| `mcp:submit_mcp_feedback` | send | none | `submit_mcp_feedback` |
| `mcp:update_ai_interviewer_outline` | write | none | `update_ai_interviewer_outline` |

### Sources

| Source | Kind | Reads or output | Method | Cost |
|---|---|---|---|---|
| `ashby.interviews` | events | `meeting` | `events_list` | free |

### Actions

None.

### Bus events

None.
<!-- /generated:capabilities -->

## Errors

Every failure reads `CODE: What happened. Next step: What to do.` The contract's codes are below; the plugin adds none.

<!-- generated:errors -->
| Code | Meaning |
|---|---|
| `NEEDS_SIGN_IN` | the account is not signed in |
| `SCOPE_MISSING` | the call needs a scope the person has not confirmed |
| `ACCOUNT_REQUIRED` | the plugin serves several accounts and the call names none |
| `ACCOUNT_UNKNOWN` | the call names an alias the plugin does not serve |
| `ACCOUNT_MISMATCH` | the item belongs to another account |
| `CURSOR_INVALID` | the cursor is malformed, or belongs to another source, account or scope |
| `CURSOR_EXPIRED` | the provider no longer keeps the history the cursor names |
| `RATE_LIMITED` | the provider asked the plugin to slow down |
| `BUDGET_EXCEEDED` | the read would cost more than the person allows |
| `SOURCE_DISABLED` | the person turned this source or action off |
| `TOO_LARGE` | the answer is larger than the source's maxBytes |
| `INPUT_INVALID` | the input does not match the method's schema |
| `SOURCE_UNKNOWN` | the plugin declares no such source |
| `SCHEMA_VIOLATION` | an answer does not keep the contract's shape |
| `PERMISSION_DENIED` | the person's grant does not cover the call |
| `PLAN_INVALID` | the plan is missing, or belongs to another method |
| `PLAN_USED` | the plan was already used by an earlier commit |
| `GRANT_INVALID` | the action grant did not verify, or was already spent |
| `HOST_UNTESTED` | OpenCode is outside the plugin's tested range |
| `OPTIONS_INVALID` | the plugin's options do not match their schema |
| `UNAVAILABLE` | the provider could not be reached |
<!-- /generated:errors -->

The bundled skill frontmatter is parsed as YAML, so a `description: >` or `description: |` block scalar registers its
folded or literal text, not the marker. A malformed file (invalid YAML, a missing field, or a bare block marker) fails
setup with `SCHEMA_VIOLATION`; the contract's table above describes the code.

## Troubleshooting

- **No Ashby tools, or `NEEDS_SIGN_IN`.** Sign in to that account's server: `/connect` and choose it, or
  `opencode mcp auth ashby` (and `ashby-<alias>` for another alias). An Org Admin must have turned on Ashby's MCP
  Server and given the person Elevated Access.
- **`ACCOUNT_REQUIRED`.** The plugin serves several aliases; pass `account`, one of the aliases `status` lists.
  `ACCOUNT_UNKNOWN` means the alias is not configured; `status` has the real list.
- **`RATE_LIMITED`.** Wait a minute, then retry with fewer, narrower calls. `UNAVAILABLE` means Ashby could not be
  reached; retry once, then call `status`.
- **`CURSOR_INVALID`.** A cursor belongs to one account and source. Read again without it, or pass the cursor with the
  account that issued it.
- **No interviews.** An interview is listed once it started 30 minutes ago, and a cancelled one is never listed. Pass
  `since` (or the previous cursor) to read a longer window; an empty page is not a failed one.
- **`HOST_UNTESTED`.** OpenCode is outside the plugin's `>=2.4.1 <2.5.0` range; install 2.4.1. `allowUntestedHost`
  exists for one migration and should stay `false`.
- **`PERMISSION_DENIED`.** The person's own rules refused the call. Change the rule or the `access` level; the plugin
  never routes around it.
- **`SCHEMA_VIOLATION` from setup.** A bundled `skills/<id>/SKILL.md` has invalid YAML, a missing field or a bare block
  marker. The error names the file; reinstall the plugin or fix the file. Descriptions written as `>`, `|`, `>-` or
  `|-` register their text.

## Docs

- [Capabilities](docs/capabilities.md): the source and the 22 pass-through tools.
- [Accounts](docs/accounts.md): one server per alias, sign-in, and picking an account in a call.
- [Configuration](docs/configuration.md): every option.
- [Architecture](docs/architecture.md): the provider client, the OpenCode APIs used, and what is cached.
- [Automations](docs/automations.md): a timer recipe for the interviews source.
- [Security](docs/security.md): what leaves the machine, redaction, and untrusted data.

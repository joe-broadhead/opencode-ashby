# Scripting

A script can call Ashby's read tools with no model: a cron job, a shell script, or any program that can reach the
OpenCode server. It uses the tools RPC, `ashby.recruiting.tools`, through `opencode api` or an OpenCode client.

| Method | The tool |
| --- | --- |
| one per known read, named after Ashby's tool: `search_records_by_name`, `filter_records`, `get_candidate`, `get_pending_tasks` and the others | `ashby_<method>`, such as `ashby_search_records_by_name` |
| `describe` | none: lists the methods, their permission actions, whether OpenCode lists each tool now, and each tool's input as JSON Schema |

The methods are exactly the read tools that the plugin knows, the ones its default rules allow (`READ_TOOLS` in
`src/ashby-tools.ts`). Call `describe` for the list: Ashby may list fewer tools for a user with less access, so
`describe` marks a known read that Ashby does not offer you as unavailable.

Each method runs the tool with the same input: Ashby's own tool, through OpenCode's own connection and sign-in. The
plugin never sees the OAuth token. Ashby's write tools, such as `create_candidate` or `add_note_to_candidate`, are
never methods, even with an allow rule. Neither is `change_application_stage`, which moves or archives a candidate,
nor `submit_mcp_feedback`, which sends text to Ashby, nor a tool that Ashby adds later.

Results hold candidate data, which is personal data: keep what a script writes where the people it is about would
expect it, and only as long as you need it.

## A script runs as a session

Every call names a session, and the session must name an agent. The script runs as that agent, with exactly the
access its model would have:

- A tool that the agent's rules or the session's rules hide from the model is refused. OpenCode hides a tool when the
  last rule that matches its permission name, such as `ashby_get_candidate`, on resource `*` is a `deny`.
- OpenCode then checks the call itself, as it does for the model: the agent's rules, the session's rules, then saved
  approvals.
- No one answers a prompt for a script, so an `ask` is refused with `PERMISSION_DENIED` at once, and no prompt is left
  waiting. The plugin's default rules allow the reads, so an agent with the default rules needs nothing more. An agent
  defined only in your config gets no default rules; `/ashby-status` names it.

Create the session once, with the agent the script runs as, and keep its id. Never reuse a session found through
history or a list: the script would run as that session's agent, under its rules.

```sh
opencode api post /api/session -d '{"title":"weekly pipeline","agent":"build"}'
```

Session rules come after the agent's, so a session can narrow what its script may do. This one can read job pipelines
and the user's pending tasks, and nothing else in Ashby:

```sh
opencode api post /api/session -d '{"title":"weekly pipeline","agent":"build","permissions":[
  {"action":"ashby_*","resource":"*","effect":"deny"},
  {"action":"ashby_get_job_pipeline","resource":"*","effect":"allow"},
  {"action":"ashby_get_pending_tasks","resource":"*","effect":"allow"}
]}'
```

## Calling a method

The body is `{"input": {"sessionID": "<session>", "input": <the tool's input>}}`. Both keys are required, and no other
key is allowed.

```sh
opencode api post /api/rpc/ashby.recruiting.tools/get_pending_tasks -d '{"input":{
  "sessionID":"ses_…",
  "input":{}
}}'
```

The tool's input is Ashby's, and Ashby defines its fields and may change them without notice: `describe` shows each
tool's schema as OpenCode lists it now. Check it rather than guess a field name or a filter's shape.

```sh
opencode api post /api/rpc/ashby.recruiting.tools/describe -d '{"input":{}}'
```

A result is `{"output": {"output": <the tool's structured content, or its text when it has none>, "text": <the tool's
text>}}`, as plain JSON. Ashby content in it, such as transcripts and notes, is untrusted data, written by other
people, and Ashby's AI output, such as criteria evaluations, is Ashby's.

## Rate limits

Ashby allows 120 requests a minute per sign-in, and 120 units of tool calls a minute per user and organisation. Most
tools cost 1 unit; `filter_records` costs 2. A script shares these limits with the model's calls under the same
sign-in, so make calls one at a time, never in parallel. When Ashby reports a rate limit, the method fails with
`UPSTREAM_ERROR`: wait a minute before the next call, and never retry in a loop.

`opencode api` calls run in the OpenCode service's default location, your home directory, whatever directory you run
them from. They use that location's plugin options, from your global config, and its `ashby` connection. To call a
project whose own config sets other options, call the HTTP API with `?location[directory]=<dir>`. The session may
belong to another directory.

## Errors

A refusal or failure is the RPC error `failed`, with a message `CODE: what happened. Next step: what to do.` and
`data: { code, next }`. `opencode api` exits with status 1 for any RPC error, after printing the error's JSON to standard output.

| Code | When |
| --- | --- |
| `SESSION_UNKNOWN` | OpenCode says the session does not exist. Any other failure to look the session up is OpenCode's own error. |
| `SESSION_AGENT_REQUIRED` | The session names no agent, or an agent that does not exist. |
| `PERMISSION_DENIED` | The agent's or the session's rules deny the tool, or ask for an approval. A deny names the denied action, such as `ashby_get_candidate`, and its next step says to remove or narrow that deny rule, add a later allow rule to the session, or use a session whose agent allows it. |
| `SERVER_CONFLICT` | Your `opencode.json` defines its own `ashby` server at a URL other than Ashby's. `/ashby-status` names both. |
| `AUTH_REQUIRED`, `CONNECTING`, `CONNECTION_FAILED`, `DISABLED`, `NOT_REGISTERED` | The `ashby` server needs a sign-in, is still connecting, could not connect, is disabled, or is missing. `/ashby-status` gives the details. |
| `TOOL_UNAVAILABLE` | The server is connected, but OpenCode does not list the tool: Ashby may list fewer tools for a user with less access. |
| `UPSTREAM_ERROR` | Ashby answered with an error, such as an invalid input, a record that does not exist or a rate limit. The message holds the first line of Ashby's text, at most 300 characters, with tokens and URL query strings removed. |
| `CANCELLED` | The request was cancelled. |

OpenCode itself answers `rpc.method_not_found` for a method that does not exist, such as a write tool or a tool
Ashby added later, and `rpc.invalid_input` for a body that is not the envelope above, with one message per problem:

| Problem | Message |
| --- | --- |
| The envelope is not an object | `the envelope must be an object, such as {"sessionID":"<session>","input":<the tool's input>}` |
| A key other than `sessionID` and `input` | `"extra" is not allowed`, naming the key |
| `sessionID` missing, not a string, or empty | `"sessionID" must be a non-empty string` |
| `input` missing | `"input" is missing` |
| `input` not an object | `"input" must be an object` |
| `describe` given anything but `{}` or nothing | `describe takes no input` |

## What scripts cannot do

- Change anything in Ashby: no write tool is a method.
- Move or archive a candidate, or send feedback to Ashby: no denied tool is a method.
- Call a tool that is not one of the known reads, even with an allow rule.
- Answer an approval prompt, or use a tool that asks.
- Use a token or key: the plugin has none to give.

A script's calls write nothing to the session, and OpenCode's `execute.before` and `execute.after` tool hooks, from
any plugin, do not run for them.

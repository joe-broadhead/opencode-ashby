# Scripting

A script can call Ashby's tools with no model: a cron job, a shell script, or any program that can reach the OpenCode
server. It uses the tools RPC, `ashby.recruiting.tools`, through `opencode api` or an OpenCode client.

Every tool the plugin knows is a method, named after Ashby's tool, without the `ashby_` prefix. Each method carries a
class: the worst thing that tool can do.

| Class | Methods | What the class means |
| --- | --- | --- |
| `read` | one per known read: `search_records_by_name`, `filter_records`, `get_candidate`, `get_pending_tasks` and the others | it only reads |
| `write` | `create_candidate`, `add_note_to_candidate`, `consider_candidate_for_job` | it changes records the hiring team sees; one can reach the candidate |
| `destructive` | `change_application_stage`, `submit_mcp_feedback` | moves or archives a candidate, or sends text to Ashby's team |
| `describe` | none: lists the methods, their class, their permission action, whether OpenCode lists each tool now, each tool's input as JSON Schema, and — given a session — whether that session may call it |

The methods come from the plugin's one tool table, `src/ashby-tools.ts`: the known reads (`READ_TOOLS` in
`src/ashby-tools.ts`), the writes in `WRITE_TOOLS`, and the two denied tools in `DENIED_TOOLS`. Call `describe` for the list. Ashby may list fewer tools for a user with less
access, so `describe` marks a known tool that Ashby does not offer you as unavailable.

The class is never the decision: the rules are. A `write` and a `destructive` method are methods too, and they run
whenever the session's rules resolve them to `allow` — which the default `access: "all"` does, for every method. The
class decides what `access: "ask-changes"` and `"read-only"` restrict, and `describe` reports it beside the resolved
permission.

Results hold candidate data, which is personal data: keep what a script writes where the people it is about would
expect it, and only as long as you need it.

## A script runs as a session

Every call names a session, and the session must name an agent. A script runs as that agent, under the rules that
decide what its model sees: the agent's rules, then the session's, and the last rule that matches an action wins.

- **Only an `allow` runs.** The rules are resolved before anything is dispatched. An `ask` is refused with no prompt
  and no Ashby call, because no one is there to answer it. A `deny` is refused with no Ashby call.
- **A saved approval does not authorise a script.** An earlier "Always allow" is not part of the agent's and the
  session's rules, so a script that relied on one now needs a rule in config: an `allow` for its action in the agent's
  or the session's rules. This is deliberate; it keeps a script's grant reviewable rather than in a list of past
  clicks.
- **A script gets the same default.** Under `access: "all"` the block allows every method, so a script that names an
  agent with the default rules can call a read or a change with nothing more. Set `access: "ask-changes"` or
  `"read-only"`, or narrow the session's own rules, when a script should not change anything. An agent defined only in
  your config gets no default rules; `/ashby-status` names it.

Create the session once, with the agent the script runs as, and keep its id. Never reuse a session found through
history or a list: the script would run as that session's agent, under its rules.

```sh
opencode api post /api/session -d '{"title":"weekly pipeline","agent":"build"}'
```

Session rules come after the agent's, so a session can narrow what its script may do, or grant one action in a
narrowly written session:

```sh
opencode api post /api/session -d '{"title":"weekly pipeline","agent":"build","permissions":[
  {"action":"ashby_*","resource":"*","effect":"deny"},
  {"action":"ashby_get_job_pipeline","resource":"*","effect":"allow"},
  {"action":"ashby_get_pending_tasks","resource":"*","effect":"allow"}
]}'
```

Under `ask-changes` or `read-only`, a method that asks needs an explicit `allow` for its action in the session's or
the agent's rules, with the shape of the two reads above and the write's own action in place of theirs. Do that only
when you mean that script to make that change unattended. `describe` with the session reports the resolved permission
of every method, so a script can check before it calls.

For a one-off script with an approval bound to it, use Jobs' `jobs_run_script`: the approval covers exactly that
source and that list of methods, and Jobs writes the run session's rules for you.

## Calling a method

The body is `{"input": {"sessionID": "<session>", "input": <the tool's input>}}`. Both keys are required, and no other
key is allowed.

```sh
opencode api post /api/rpc/ashby.recruiting.tools/get_pending_tasks -H "x-opencode-directory:$PWD" -d '{"input":{
  "sessionID":"ses_…",
  "input":{}
}}'
```

The tool's input is Ashby's, and Ashby defines its fields and may change them without notice: `describe` shows each
tool's schema as OpenCode lists it now. Check it rather than guess a field name or a filter's shape.

```sh
opencode api post /api/rpc/ashby.recruiting.tools/describe -H "x-opencode-directory:$PWD" -d '{"input":{}}'
opencode api post /api/rpc/ashby.recruiting.tools/describe -H "x-opencode-directory:$PWD" -d '{"input":{"sessionID":"ses_…"}}'
```

With a session, each method in the answer also carries `permission`: `allow`, `ask` or `deny`, resolved exactly as a
call would be. That is how a script checks itself before it emits a call. The answer also carries `location`, and
`unclassified` when Ashby lists a tool the plugin's table does not classify; such a tool is never a method.

A result comes back as `{ output?, text }`: the tool's structured content when it has any, and its text parts
joined by newlines. Ashby content in it, such as transcripts and notes, is untrusted data, written by other people, and
Ashby's AI output, such as criteria evaluations, is Ashby's.

## The location

Run the command in the project whose agent you mean, and send the call to that location explicitly:

```sh
opencode api post /api/rpc/ashby.recruiting.tools/<method> -H "x-opencode-directory:$PWD" -d '{…}'
```

Without it the call goes to the service's default location and fails `rpc.unavailable` if the plugin is not loaded
there. The HTTP equivalents are the `location[directory]` query parameter and the same header. `describe` reports the
`location` that answered and a `locationHint`.

A location unloads after OpenCode's idle timeout. If a scheduled script gets `rpc.unavailable` from a location that was
loaded before, send the call again once: the request loads the location. Jobs keeps its own location loaded.

## Rate limits

Ashby allows 120 requests a minute per sign-in, and 120 units of tool calls a minute per user and organisation. Most
tools cost 1 unit; `filter_records` costs 2. A script shares these limits with the model's calls under the same
sign-in, so make calls one at a time, never in parallel. When Ashby reports a rate limit, the method fails with
`UPSTREAM_ERROR`: wait a minute before the next call, and never retry in a loop.

## Errors

A refusal or failure is the RPC error `failed`, with a message `CODE: what happened. Next step: what to do.` and
`data: { code, next }`. `opencode api` exits with status 1 for any RPC error, after printing the error's JSON to standard output.

| Code | When |
| --- | --- |
| `SESSION_UNKNOWN` | OpenCode says the session does not exist in this location. The next step names the `x-opencode-directory` header. Any other failure to look the session up is OpenCode's own error. |
| `SESSION_AGENT_REQUIRED` | The session names no agent, or an agent that does not exist. |
| `PERMISSION_DENIED` | The last matching rule is an `ask` or a `deny`, so the call was refused before dispatch. An ask says that a script cannot answer and names the allow rule to add; a deny names the denied action and says to remove or narrow that rule, add a later allow to the session, or use a session whose agent allows it. A saved "Always allow" does not help. |
| `SERVER_CONFLICT` | Your `opencode.json` defines its own `ashby` server at a URL other than Ashby's. `/ashby-status` names both. |
| `AUTH_REQUIRED`, `CONNECTING`, `CONNECTION_FAILED`, `DISABLED`, `NOT_REGISTERED` | The `ashby` server needs a sign-in, is still connecting, could not connect, is disabled, or is missing. `/ashby-status` gives the details. |
| `TOOL_UNAVAILABLE` | The server is connected, but OpenCode does not list the tool: Ashby may list fewer tools for a user with less access. |
| `UPSTREAM_ERROR` | Ashby answered with an error, such as an invalid input, a record that does not exist or a rate limit. The message holds the first line of Ashby's text, at most 300 characters, with tokens and URL query strings removed. |
| `CANCELLED` | The request was cancelled. |

OpenCode itself answers `rpc.method_not_found` for a method that does not exist, such as a tool Ashby added later, and
`rpc.invalid_input` for a body that is not the envelope above, with one message per problem:

| Problem | Message |
| --- | --- |
| The envelope is not an object | `the envelope must be an object, such as {"sessionID":"<session>","input":<the tool's input>}` |
| A key other than `sessionID` and `input` | `"extra" is not allowed`, naming the key |
| `sessionID` missing, not a string, or empty | `"sessionID" must be a non-empty string` |
| `input` missing | `"input" is missing` |
| `input` not an object | `"input" must be an object` |
| `describe` given anything but nothing, `{}` or `{"sessionID":"…"}` | `describe takes nothing, or {"sessionID":"<session>"}` |

## What scripts cannot do

- Run a method whose action resolves to `ask` or `deny`: no one can answer a prompt, and a deny needs its rule changed.
- Rely on a saved "Always allow" from the model path: a script needs an `allow` rule in config, or a Jobs one-off's
  approval.
- Call a tool that is not in the plugin's table, even with an allow rule. It is reported as `unclassified`.
- Use a token or key: the plugin has none to give.

A script's calls write nothing to the session, and OpenCode's `execute.before` and `execute.after` tool hooks, from
any plugin, do not run for them. The plugin applies the same result shaping it applies on the model path, so a read's
result reads the same either way. Ashby has no such hook today, so both shapers pass everything through unchanged.

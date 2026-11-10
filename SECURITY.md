# Security

## Supported versions

Fixes go into the newest release. Older releases are not patched.

## Reporting a vulnerability

Report vulnerabilities privately through GitHub private vulnerability reporting: open the repository's **Security**
tab and choose **Report a vulnerability**. Do not open a public issue. Include the plugin version, the OpenCode
version, your plugin options and the steps to reproduce. Never include tokens, candidate data or other Ashby
content.

Vulnerabilities in Ashby's service or in OpenCode itself are out of scope. Report those to Ashby or to the
OpenCode project.

## Data handling

- The plugin holds no credential and runs no network request of its own. It registers Ashby's MCP server with OpenCode,
  and OpenCode connects, signs in and stores the credentials. The tools RPC for scripts (see [Scripts](#scripts)) runs
  Ashby's tools through OpenCode's own connection, too.
- The plugin never reads tokens. Of a user's own `mcp.servers.ashby` entry it reads only the type, the URL and whether
  `oauth` is `false`; it never reads, copies or reports its `headers`. Status shows server URLs without their query
  strings, never OpenCode's text for a needed sign-in, which can hold an authorization URL, and cuts a connection
  failure's reason to one line with no URL credentials, query or token.
- Status shows the name OpenCode keeps on the sign-in, if any, on one line. The plugin captures nothing from Ashby's
  results, and never calls Ashby itself.
- **Candidate data is personal data.** Profiles, resumes, notes, emails, feedback, offers and transcripts reach the
  model as tool results, and the agent sends them to your model provider, like any other tool result in the session.
  Under Ashby's terms, your organisation decides on third-party integrations and answers for them, including notices
  to candidates; its own approval of AI tools applies. Ashby stores and processes its data in the United States.
- Ashby content is untrusted. Resumes, notes and emails come from other people and can contain instructions aimed at
  the model. The skills tell the model to treat them as data, to label Ashby's AI output as Ashby's, never to infer
  protected characteristics, and never to repeat EEO, diversity or demographic data.
- **Every Ashby tool is allowed by default**, so an agent can create a candidate, add a note to a profile, add someone
  to a job's pipeline, move or archive an application, and send feedback to Ashby's team without a prompt. Two of those
  reach people: `ashby_change_application_stage` moves or archives a candidate, and archiving can send them an automated
  archive email, which can't be taken back; `ashby_consider_candidate_for_job` can email the candidate, when the first stage
  has an automatic email, and the tool has no option to stop it. `ashby_submit_mcp_feedback` sends text to Ashby's team,
  and text written after a failed lookup could carry candidate data.
- **One line restricts it.** Set `"access": "ask-changes"` in the plugin options and every change asks first, or
  `"access": "read-only"` and every change is denied. A rule in an agent's own `permissions` restricts one agent, and a
  `deny` in the top-level `permissions` restricts every agent. The README's
  [Permissions](https://github.com/joe-broadhead/opencode-ashby/blob/HEAD/README.md#permissions) has the three blocks.

## Permissions

What the model can do in Ashby is limited by these layers, in this order:

1. **Ashby's server and your access roles.** The sign-in is your own Ashby user, and the server returns only what that
   user can see in Ashby: offers need Org Admin or Admin - Private, moving or archiving needs Hiring Manager or higher,
   and confidential jobs stay hidden unless granted. An Org Admin can turn MCP off for the whole organisation. Ashby
   offers one scope for all of MCP, so there is no read-only sign-in: read-only use comes from permission rules.
2. **Default permission rules.** The plugin inserts one block generated from the tool table and the `access` option.
   Its default, `all`, allows every Ashby tool, reads and changes alike. `ask-changes` allows a read and asks for
   everything else; `read-only` allows a read and denies everything else, which also hides it from the model. Some
   changes reach people: `ashby_consider_candidate_for_job` can email the candidate through the first stage's automatic
   email, and a note can notify a colleague it mentions or the people following the candidate.
3. **Your OpenCode permissions.** Your `permissions` rules and saved "Always allow" answers override the default
   rules. A `deny` you configure always wins.

Things to know:

- **Saved approvals are broad.** "Always allow" on an Ashby tool saves the pattern `*` for that tool's action. It
  applies to every agent in the OpenCode project, Plan included, until you remove it. Think twice before saving one
  for a tool that reaches candidates. OpenCode identifies a project by its git repository. A folder outside any git
  repository with a commit may belong to OpenCode's shared `global` project, so an approval saved there may apply in
  other such folders too.
- **Some agents get no default rules.** Agents defined only in your own config, and agents added by plugins that load
  after this one, are created after the plugin inserts its rules, and agents without a base allow get none. Under the
  default `access: "all"` that changes nothing; under `ask-changes` or `read-only` those agents stay unrestricted.
  `/ashby-status` names them and gives the fix: put the block it shows first in that agent's own `permissions`,
  followed by your top-level rules for Ashby tools. Do not put an `ask` or an `allow` in the top-level `permissions`,
  which would loosen Explore.
- **Unattended runs refuse prompts.** In `opencode run`, an Ashby tool that would ask is refused.
- **The `ashby_*` rule also matches other servers** whose names start with `ashby_`. For their tools it only adds
  prompts.
- **The rules follow the name, not the server.** When your own `mcp.servers.ashby` points at another URL, status
  reports a conflict and the plugin adds no server, but the default rules still allow the known read names, so a tool
  of that server with such a name runs without asking. Point the entry at Ashby's URL, or remove it.

## Scripts

The tools RPC (`ashby.recruiting.tools`, see
[docs/scripting.md](https://github.com/joe-broadhead/opencode-ashby/blob/HEAD/docs/scripting.md)) exposes every known
Ashby tool as a method for a script, with no model, each with a class: read, write or destructive. It adds no
authority:

- A script names a session that names an agent, and runs as them. The rules that decide are the agent's, then the
  session's, resolved before dispatch: only `allow` runs. An `ask` is refused with no prompt and no Ashby call, and a
  `deny` is refused with no Ashby call. A saved "Always allow" is not part of those rules and does not authorise a
  script; a script's grant is a rule in config, or a Jobs run session.
- A script gets the same default: under `access: "all"` the block allows every method, so a script can call a write
  with no further rule. Restrict the session's agent, or the session's own rules, to narrow that; with `ask-changes` or
  `read-only` a script needs an explicit `allow` for a change, and an `ask` is refused because no one is there.
- OpenCode's own executor still checks an MCP call against the agent's rules, the session's rules and saved approvals.
  A session in another directory than the server answering the call runs under the serving location's agent rules: the
  README's known limits say so, and `docs/scripting.md` gives the `x-opencode-directory` header that names the location.
- An inner ask on a script's call is denied, not prompted. The plugin's permission hook changes only an ask on one of
  its own script calls in flight, only to a deny, and leaves every other call alone.
- A tool that Ashby adds later is not a method, even with an allow rule; `describe` reports it as unclassified.
- The call goes through OpenCode's own MCP connection and sign-in. The plugin never sees the token, and returns none.
- Ashby's error text reaches the script only as the first line, at most 300 characters, with tokens and URL query
  strings removed.
- OpenCode's `execute.before` and `execute.after` tool hooks, from any plugin, do not run for a script's call, so
  another plugin's policy hook does not see it. The plugin's own shapers apply the same result shaping it applies on
  the model path; Ashby has no such hook, so both pass everything through. A script's calls are not recorded in the
  session.
- The RPC is reachable only by callers of the OpenCode server API, who already hold the server's full authority. The
  session is not a login: it scopes a script to what its agent may do.

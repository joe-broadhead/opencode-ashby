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
- Two tools are denied by default: `ashby_change_application_stage`, which moves or archives a candidate (archiving can
  send the candidate an automated archive email, which can't be taken back), and `ashby_submit_mcp_feedback`, which
  sends text to Ashby's team, where text written after a failed lookup could carry candidate data. Turning one on
  takes an `ask` rule in an agent's own `permissions`, so each call still asks, in that agent only.

## Permissions

What the model can do in Ashby is limited by these layers, in this order:

1. **Ashby's server and your access roles.** The sign-in is your own Ashby user, and the server returns only what that
   user can see in Ashby: offers need Org Admin or Admin - Private, moving or archiving needs Hiring Manager or higher,
   and confidential jobs stay hidden unless granted. An Org Admin can turn MCP off for the whole organisation. Ashby
   offers one scope for all of MCP, so there is no read-only sign-in: read-only use comes from permission rules.
2. **Default permission rules.** Every Ashby tool asks before it runs, except Ashby's read tools listed in
   `src/ashby-tools.ts`, which run without a prompt. Moving or archiving a candidate and `ashby_submit_mcp_feedback`
   are denied. Some changes that ask still reach people: `ashby_consider_candidate_for_job` runs the first stage's
   automatic activities, which may email the candidate, and a note's mention notifies a colleague.
3. **Your OpenCode permissions.** Your `permissions` rules and saved "Always allow" answers override the default
   rules. A `deny` you configure always wins.

Things to know:

- **Saved approvals are broad.** "Always allow" on an Ashby tool saves the pattern `*` for that tool's action. It
  applies to every agent in the OpenCode project, Plan included, until you remove it. Think twice before saving one
  for a tool that reaches candidates. OpenCode identifies a project by its git repository. A folder outside any git
  repository with a commit may belong to OpenCode's shared `global` project, so an approval saved there may apply in
  other such folders too.
- **Some agents get no default rules.** Agents defined only in your own config, and agents added by plugins that load
  after this one, are created after the plugin inserts its rules, and agents without a base allow get none. Ashby tools
  may run there without asking. `/ashby-status` names these agents and gives the fix: put the default rules it shows
  first in that agent's own `permissions`, followed by your top-level rules for Ashby tools. Do not put them in the
  top-level `permissions`, which would loosen Explore.
- **Unattended runs refuse prompts.** In `opencode run`, an Ashby tool that would ask is refused.
- **The `ashby_*` rule also matches other servers** whose names start with `ashby_`. For their tools it only adds
  prompts.
- **The rules follow the name, not the server.** When your own `mcp.servers.ashby` points at another URL, status
  reports a conflict and the plugin adds no server, but the default rules still allow the known read names, so a tool
  of that server with such a name runs without asking. Point the entry at Ashby's URL, or remove it.

## Scripts

The tools RPC (`ashby.recruiting.tools`, see
[docs/scripting.md](https://github.com/joe-broadhead/opencode-ashby/blob/HEAD/docs/scripting.md)) runs Ashby's
known read tools for a script, with no model. It adds no authority:

- A script names a session that names an agent, and runs as them. A tool that the agent's or the session's rules hide
  from the model is refused. OpenCode's own executor then checks the call against the agent's rules, the session's
  rules and saved approvals, as it does for the model.
- An ask on a script's call is denied, not prompted: no one is there to answer it. The plugin's permission hook
  changes only an ask on one of its own script calls in flight, only to a deny, and leaves every other call alone.
- Only the known reads are methods. Ashby's write tools never are, nor `change_application_stage`, nor
  `submit_mcp_feedback`, nor a tool that Ashby adds later, even with an allow rule.
- The call goes through OpenCode's own MCP connection and sign-in. The plugin never sees the token, and returns none.
- Ashby's error text reaches the script only as the first line, at most 300 characters, with tokens and URL query
  strings removed.
- OpenCode's `execute.before` and `execute.after` tool hooks, from any plugin, do not run for a script's call, so
  another plugin's policy hook does not see it. A script's calls are not recorded in the session.
- The RPC is reachable only by callers of the OpenCode server API, who already hold the server's full authority. The
  session is not a login: it scopes a script to what its agent may do.

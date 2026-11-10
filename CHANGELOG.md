# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.0.0] - 2026-11-10

### Added

- Jelly shows an `access` setting (`all`, `ask-changes` or `read-only`; `all` by default), the option the plugin already reads.
- Registers Ashby's official MCP server, `https://mcp.ashbyhq.com/mcp/v1`, as `ashby`, signed in with OpenCode's own
  MCP OAuth. OpenCode registers itself with Ashby's sign-in server and requests the scopes Ashby names, refresh scope
  included. No client ID or key to configure.
- Names the server's `/connect` entry "Ashby", and marks its account "Sign in required" while the server needs a new
  sign-in.
- Adopts your own `mcp.servers.ashby` at Ashby's URL unchanged. The plugin never reads its headers. Any other URL, or a
  local command, is a conflict that status explains.
- `/ashby-status` and the `/ashby` dialog ("Ashby: Status" in the palette): connection, account, access, tools, agents
  without the default rules, the OpenCode check and one next step. A skill of yours with one of the plugin's ids is
  named, with a next step.
- The status RPC `ashby.recruiting/status`, with the fields this family of plugins shares.
- The tools RPC `ashby.recruiting.tools`, which lets scripts call every known Ashby tool with no model, as a session
  and its agent, each method under a prior explicit allow.
- Two skills: `ashby` (finding candidates, jobs and applications, filters and counts, interview prep, what you owe,
  citing, and the rules for candidate data) and `ashby-write` (whom each change reaches, said before the call, with
  the permission prompt as the yes under `access: "ask-changes"`).
- The option `allowUntestedHost`, and a host check for OpenCode `>=2.2.3 <2.3.0`, tested on 2.2.3, 2.2.4, 2.2.5 and
  2.2.6.
- A `jelly` declaration for Jelly: the tools with their default effects, the skills, the sign-in, a summary and an
  icon.
- The family icon kit's mark and its 128 and 256 pixel rasters, declared in `opencode.icons` and exported from the
  package, with `opencode.vendor` naming Ashby's domain: a display app may show Ashby's own logo from Ashby's site,
  and the package carries no vendor marks.

### Changed

- The tool table follows a signed-in server's tool list. The upcoming-interviews tool is now `list_interviews`, a read with a date window, and every tool's parameters are recorded, each with its required mark. Every tool requires a `reason`, so a script must send one. The write warnings say what Ashby does: adding a candidate to a job can email them through the first stage's automatic email, which the tool cannot stop, and a note saves at once and can notify people following the candidate.
- Both skills explain how to connect Ashby when its tools are absent, including the organisation's MCP prerequisite.

- Default permission rules after each agent's base allow: every tool is allowed, reads and changes alike, so an agent
  can create a candidate, add a note or move an application without a prompt. The option `access` restricts them:
  `ask-changes` asks for every change, and `read-only` denies every change. The README prints the block each value
  generates, and three ways to restrict a single agent or tool.
- The tools RPC is v2: every known tool is scriptable under a prior explicit allow, each method carries its class,
  `describe` takes a session and reports each method's permission, and `shapeInput` runs beside `shapeResult` so a
  script's call reaches Ashby with the model path's arguments. A saved "Always allow" no longer authorises an ad-hoc
  script: a grant is a rule in config, or a Jobs run session.

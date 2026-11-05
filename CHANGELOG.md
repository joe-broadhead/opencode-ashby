# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.0.0] - Unreleased

### Added

- Registers Ashby's official MCP server, `https://mcp.ashbyhq.com/mcp/v1`, as `ashby`, signed in with OpenCode's own
  MCP OAuth. OpenCode registers itself with Ashby's sign-in server and requests the scopes Ashby names, refresh scope
  included. No client ID or key to configure.
- Names the server's `/connect` entry "Ashby", and marks its account "Sign in required" while the server needs a new
  sign-in.
- Adopts your own `mcp.servers.ashby` at Ashby's URL unchanged. The plugin never reads its headers. Any other URL, or a
  local command, is a conflict that status explains.
- Default permission rules after each agent's base allow: every Ashby tool asks, and Ashby's read tools run without a
  prompt. Two tools are denied: `ashby_change_application_stage` (moves or archives a candidate; archiving can email
  the candidate) and `ashby_submit_mcp_feedback` (text sent to Ashby's team). The docs give the rule that turns each
  back on as an ask.
- `/ashby-status` and the `/ashby` dialog ("Ashby: Status" in the palette): connection, account, access, tools, agents
  without the default rules, the OpenCode check and one next step. A skill of yours with one of the plugin's ids is
  named, with a next step.
- The status RPC `ashby.recruiting/status`, with the fields this family of plugins shares.
- The tools RPC `ashby.recruiting.tools`, which lets scripts call Ashby's read tools with no model, as a session and
  its agent.
- Two skills: `ashby` (finding candidates, jobs and applications, filters and counts, interview prep, what you owe,
  citing, and the rules for candidate data) and `ashby-write` (whom each change reaches, said before the call, with
  OpenCode's permission prompt as the yes).
- The option `allowUntestedHost`, and a host check for OpenCode `>=2.2.3 <2.3.0`, tested on 2.2.3, 2.2.4 and 2.2.5.
- A `jelly` declaration for Jelly: the tools with their default effects, the skills, the sign-in, a summary and an
  icon.

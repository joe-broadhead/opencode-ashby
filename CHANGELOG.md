# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.0.6] - 2026-11-18

### Changed

- Tested on OpenCode 2.3.1 and 2.3.2. The supported range is unchanged (`>=2.2.3 <2.4.0`). `TESTED_HOSTS` is now 2.2.3,
  2.2.4, 2.2.5, 2.2.6, 2.2.7, 2.3.0, 2.3.1 and 2.3.2, so the host and pack stages, CI and the release's install check
  run on both; the plugin is tested on 2.2.3, 2.2.4, 2.2.5, 2.2.6, 2.2.7, 2.3.0, 2.3.1 and 2.3.2. They need nothing
  else from this plugin: between 2.3.0 and 2.3.2 the only API changes are that `experimental.generate` excludes video
  jobs and a new `codemode` session event kind.

## [0.0.5] - 2026-11-17

### Added

- **A source for the shared source contract:** `ashby.interviews` (`package.json`'s `sources`, contract version 1,
  `@we-the-rebel-alliance/source-contract` v0.2.0), so a consumer such as Memory can read the signed-in user's own Ashby
  interviews as dated events. Two tools RPC methods on `ashby.recruiting.tools`, never tools the model sees:
  `events_list`, read through `list_interviews` one week per call (in halves when Ashby marks a week cut short, and
  `UNAVAILABLE` with the cursor held when any entry of an answer cannot be read; a dense week read across pages), an
  interview once it started 30 minutes ago, or later when it shows up late within the seven days behind the cursor, and
  never a cancelled one, oldest first with a cursor bound to the sign-in; and `probe`, who is signed in, which calls
  Ashby for nothing. An event carries metadata only: the interview event id, the start, the title and job, the
  candidate and the interviewers by Ashby's ids and names, and an ashbyhq.com link. Never an email, a phone number,
  feedback, a scorecard, a note or a transcript; its text is always empty, and a title that holds a secret is refused.
- The default rules allow `ashby_events_list` and `ashby_probe` under every `access` value, after the tool rules.
- The source contract's codes for the two methods: `INPUT_INVALID`, `SOURCE_UNKNOWN`, `ACCOUNT_MISMATCH`,
  `CURSOR_INVALID`, `NEEDS_SIGN_IN`, `RATE_LIMITED` and `UNAVAILABLE` (the `source` surface).
- `npm run conformance`, a stage of `npm run check`: the contract's conformance kit over the source, on invented
  interviews, writing `reports/conformance-report.json` for a release to attach.
- `list_interviews`' envelope, as a live read recorded it (`{ data: { interviews, returnedCount, truncated,
  onOrAfterDate, onOrBeforeDate, message } }`): `truncated` and the echoed window (UTC) decide a week cut short, and
  `returnedCount` an empty one. **Unconfirmed:** an interview's own fields (`interviewEventId`, a start time with its
  zone) are assumed until a live answer that holds one is recorded.
- **Deferred** until the consumers (jelly and Memory) have re-vendored source-contract 0.2.0: the owner's `verified: false`
  (Ashby does not confirm OpenCode's sign-in) and `permission.identity: []` (the probe asserts no identity operation).
  A consumer on 0.1.x refuses both, so neither is sent yet; the conformance test that pins their absence flips then.

### Changed

- The tools RPC's transport is the source contract's `tools-rpc` module, bundled into `dist/index.js`, in place of the
  copy in `src/host/tools-rpc.ts`; Ashby's part is `src/tools-rpc.ts`. Scripts see the same RPC id, methods, codes and
  next steps.

## [0.0.4] - 2026-11-15

### Added

- **For jelly:** `jelly.admin`, the step jelly shows on the plugin's review after "Before anyone signs in, your admin
  needs to": "turn on MCP Server in Ashby (Admin > Organization Setup > Opt-In Features) and give each user Elevated
  Access".

## [0.0.3] - 2026-11-15

### Changed

- OpenCode 2.3 is admitted: the host range is `>=2.2.3 <2.4.0` (it was `>=2.2.3 <2.3.0`), tested on 2.2.3, 2.2.4, 2.2.5, 2.2.6, 2.2.7 and 2.3.0.
  The host and pack stages, CI and the release's install check run every one of them. A later 2.2 or 2.3 release
  starts and status calls it untested; the `HOST_UNTESTED` example host is now 2.4.0.
- Apart from the status fix below, OpenCode 2.3 needs nothing else from this plugin. It does not call the `subagent` tool or read
  `session.tool.failed`; Ashby's tools are Ashby's MCP tools, which OpenCode runs and stops itself when the person presses Stop; and it has no use
  for the new `session.fork` hook.
- The host test of a call that names another location waits until the plugin has loaded there: from OpenCode 2.2.7 a
  location opened by a call answers `rpc.unavailable` until its plugins have registered.
- The icon is now Ashby's own mark, Ashby's app icon, the serif "A" on Ashby purple, as app.ashbyhq.com serves it, in place of the family's drawn mark; `opencode.vendor.mark` is `true`, and the README says Ashby is a trademark of Ashby, Inc.

### Fixed

- Status, `/ashby-status` and the `/ashby` dialog read the server's source and the default rules' outcome after listing
  the servers and agents. OpenCode records them only when something reads that state, so right after start-up a status
  read could miss them.

## [0.0.2] - 2026-11-14

### Removed

- `search_product_docs`, which Ashby's help page lists but Ashby's server does not serve, from the declaration, the
  known reads, the default rules, the `ashby` skill and the README. The skill now says no Ashby tool answers a how-to
  question.

### Added

- `test/fixtures/live-tools.json`, Ashby's tool list for a signed-in user, captured live on 14 November 2026, and a
  test that fails when the declaration and that list disagree.

## [0.0.1] - 2026-11-13

### Added

- The `jelly` settings declare their choices: `access` is drawn as Allowed, Ask before changes or Read only, with
  Jelly's own line for each (needs a jelly that includes app#1301).

## [0.0.0] - 2026-11-10
<!-- kit-release: the GitHub release v0.0.0 -->

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

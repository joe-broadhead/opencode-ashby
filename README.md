# Ashby for OpenCode

Find and read your Ashby candidates, pipeline, interviews and feedback from OpenCode, and add a candidate, a note or
a pipeline entry, each asking first, through Ashby's official MCP server.

Unofficial; not affiliated with Ashby.

## Requirements

- OpenCode `>=2.2.3 <2.3.0`, tested on 2.2.3, 2.2.4 and 2.2.5. Outside that range the plugin does not start, unless
  you set `allowUntestedHost`.
- macOS or Linux, and a browser for the sign-in.
- An Ashby organisation on any plan except Analytics-only.
- An Org Admin has turned on **MCP Server** (Admin > Organization Setup > Opt-In Features).
- Your Ashby user has **Elevated Access**. What you can read and change follows your Ashby access roles: offers need
  Org Admin or Admin - Private, moving or archiving a candidate needs Hiring Manager or higher, and confidential jobs
  stay hidden unless you were granted them.
- Ashby's MCP server is in beta, and Ashby may change its tools without notice. A tool Ashby adds asks before it runs
  until a release of this plugin knows it.
- The 17 tools, and which of them read and write, come from Ashby's own help page until a release reconciles them with
  a live tool list. Treat a tool's class as Ashby's description of it, not as its annotation.
- Ashby stores and processes its data in the United States.

## Install

```sh
opencode plugin add @joe-broadhead/opencode-ashby
```

Run `opencode reload`, or restart OpenCode. Then run `/ashby-status`: it shows `sign-in required` until you sign in
(see [Sign in](#sign-in)).

The plugin registers Ashby's MCP server under the name `ashby`, adds default permission rules, the `/ashby-status`
command, the `/ashby` status view and two skills. Every tool is Ashby's, and OpenCode handles the connection, the
sign-in and the stored credentials.

**Update** with `opencode plugin update @joe-broadhead/opencode-ashby`, then run `opencode reload`. An entry pinned
to a version does not update: remove the `@version` from its `plugins` entry first.

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
write, whose default rule asks, needs an explicit `allow` in the session's or the agent's rules, and the two denied
tools need their deny removed. An `ask` is refused before anything reaches Ashby, and a saved "Always allow" does not
authorise a script.

```sh
opencode api post /api/rpc/ashby.recruiting.tools/get_pending_tasks \
  -H "x-opencode-directory:$PWD" \
  -d '{"input":{"sessionID":"ses_…","input":{}}}'
```

See [Scripting](https://github.com/joe-broadhead/opencode-ashby/blob/HEAD/docs/scripting.md).

## Permissions

The plugin adds these rules to every agent, directly after the agent's base rule that allows everything:

1. `{ "action": "ashby_*", "resource": "*", "effect": "ask" }`: every Ashby tool asks, including tools Ashby adds
   later.
2. One `allow` rule for each of Ashby's 12 read tools, listed in
   [`src/ashby-tools.ts`](https://github.com/joe-broadhead/opencode-ashby/blob/HEAD/src/ashby-tools.ts). These run
   without a prompt.
3. Two `deny` rules, for tools that are off until you turn them on. A deny also hides the tool from the model.
   - `{ "action": "ashby_change_application_stage", "resource": "*", "effect": "deny" }`: moves a candidate to another
     stage, or archives them. Archiving runs the Archived stage's automatic activities, so the candidate still gets any
     automated archive email.
   - `{ "action": "ashby_submit_mcp_feedback", "resource": "*", "effect": "deny" }`: sends text to Ashby's team.

   To turn one on for an agent, add a rule that makes it **ask** to that agent's own `permissions`, which come after
   the plugin's block. For the build agent:

   ```json
   {
     "agents": {
       "build": {
         "permissions": [{ "action": "ashby_change_application_stage", "resource": "*", "effect": "ask" }]
       }
     }
   }
   ```

   Not in the top-level `permissions`: a top-level rule reaches every agent, Explore included. Never make a denied
   tool `allow`, and don't answer "Always allow" for it: that would save an allow for every agent in the project.

So reads run, the 3 write tools ask before they run, and the two above don't run at all. Each write reaches people:

- `ashby_create_candidate`: a new candidate record that everyone with access to candidates sees.
- `ashby_consider_candidate_for_job`: adds the candidate to a job's pipeline, which its hiring team sees. The job's
  first stage's automatic activities run, and some organisations email candidates there.
- `ashby_add_note_to_candidate`: a note, or a reply, on the candidate's profile. Ashby may hold it as a draft for you
  to confirm; once saved, everyone with access to the profile sees it, and a mentioned colleague is notified.

Everything that comes later than these rules still wins: an agent's own stricter rules (Explore cannot use Ashby),
your `permissions` in `opencode.json`, and your saved "Always allow" answers. In an unattended run such as
`opencode run`, a tool that asks is refused.

Agents that exist only in your own config, and agents added by plugins that load later, are created after the plugin
adds its rules, so Ashby tools run there without asking. `/ashby-status` and `/ashby` name those agents and show the
default rules to put first in each one's own `permissions`. Do not put them in the top-level `permissions`, which would
loosen Explore.
[Configuration](https://github.com/joe-broadhead/opencode-ashby/blob/HEAD/docs/configuration.md#permissions) has a
worked example and permission recipes.

## Configure

Set options with the object form of the plugin entry:

```json
{
  "plugins": [{ "package": "@joe-broadhead/opencode-ashby", "options": { "allowUntestedHost": true } }]
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
  "plugins": ["@joe-broadhead/opencode-ashby"],
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
| Tools: off by default | The tools the default rules deny, listed by name. See [Permissions](#permissions) to turn one on, as an ask. |
| Tools: unknown | Ashby added tools the plugin does not know yet. They ask before they run. A known tool missing from the count is normal: Ashby may list fewer tools for less access. |
| Access: default rules missing or not added | Some agents lack the default rules (see the agents row), or OpenCode could not add them (see the OpenCode row). Follow the next step. |
| Account: account name not reported | Nothing is wrong: Ashby's MCP has no account tool, and OpenCode keeps no name on this sign-in. Ashby's answers follow the user you signed in as. |
| Answers miss jobs or candidates | Ashby returns only what your access roles allow, and confidential jobs stay hidden unless you were granted them. Ask an Ashby admin for access. |
| Rate limited | Ashby allows 120 requests a minute per sign-in. Wait a minute, and make fewer calls at once. |
| A move or archive is refused | `ashby_change_application_stage` is off by default. See [Permissions](#permissions) to turn it on as an ask, or make the change in Ashby. |
| Agents without default rules | Put the default rules shown by `/ashby-status` first in each listed agent's own permissions, in `opencode.json` or the agent's Markdown file, followed by your top-level rules for Ashby tools. |
| OpenCode: untested | OpenCode is not 2.2.3, 2.2.4 or 2.2.5. Inside `>=2.2.3 <2.3.0` the plugin runs normally; outside it, it runs only because `allowUntestedHost` is set. If Ashby misbehaves, use a tested release. |
| Signed in to the wrong Ashby account | Run `opencode mcp logout ashby` from the project folder (or remove the account in `/connect` → Ashby); if it answers `MCP server not found: ashby`, wait a few seconds and run it again. Then sign in again. |
| Asked to sign in again after about an hour | Ashby may issue no refresh token, so the sign-in cannot be renewed. Sign in again with `/connect` → Ashby; your Ashby session may still be open in the browser. |
| An Ashby tool is refused in `opencode run` | Nobody could answer its prompt. A read runs if you add an `allow` rule for it to the agent's own `permissions`. A write needs an interactive session: this plugin documents no `allow` for one, and a saved one would run it unasked in every agent of the project. |
| A skill seems ignored, and status names a skill to rename or move | A skill of yours with the same id, such as `ashby`, replaces the plugin's. Rename or move it. |
| `/ashby` is missing | The plugin did not start. Run `/plugins` to see the error. |
| `OPTIONS_INVALID` | An option is unknown or has a wrong value. The message names the option and the accepted values. |
| `HOST_UNTESTED` | Your OpenCode is outside `>=2.2.3 <2.3.0`, so the plugin did not start. Use OpenCode `>=2.2.3 <2.3.0`, or set `"allowUntestedHost": true` to run anyway. |
| `STATUS_UNAVAILABLE` | The status could not be read, or the plugin is not running. Follow the next step in the message. |
| `SKILLS_INVALID` | A skill file in the package is missing or broken. Reinstall the plugin. |
| `SERVER_NOT_REGISTERED` | The plugin could not register the `ashby` server. Restart OpenCode. |
| `RULES_NOT_ADDED` | The default permission rules could not be added, so Ashby tools may run without asking. Restart OpenCode. |

A script's errors from the tools RPC have their own codes, listed in
[Scripting](https://github.com/joe-broadhead/opencode-ashby/blob/HEAD/docs/scripting.md#errors).

## Known limits

- **The tool table comes from Ashby's help page.** Ashby lists no annotations, and this release has not been
  reconciled with a live tool list, so a tool Ashby marks as changing data could run here as a read until a release
  does. `test/unit/ashby-tools.json` records the list, and `npm run drift -- <tools.json> --strict` is the check that
  reconciles it.
- **A script's read can cross projects.** A script's session may belong to another directory than the OpenCode server
  answering it, and the read then runs under the serving location's agent rules; only a `deny` is refused in between.
  Run scripts in the project whose agent you mean. This is in the module shared with the other plugins, not in this
  one.
- **In Jelly, a tool Ashby adds is not asked about.** Jelly applies each declared tool's effect and nothing else, so an
  undeclared tool, a write included, runs without asking until a release of this plugin declares it. A Jelly admin can
  set it to ask.

## Uninstall

Sign out while the plugin is still installed: once it is removed, OpenCode no longer knows the `ashby` server, so
`opencode mcp logout ashby` fails with `MCP server not found: ashby` and the sign-in stays in OpenCode's credential
store.

1. Sign out: `opencode mcp logout ashby` from the project folder where the plugin is installed, or remove the account
   in `/connect` → Ashby. If it answers `MCP server not found: ashby`, OpenCode is still opening that folder: wait a
   few seconds and run it again.
2. Check: `opencode auth list` no longer lists **Ashby**.
3. Remove the plugin: `opencode plugin remove @joe-broadhead/opencode-ashby`, then `opencode reload`.
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

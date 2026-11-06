# In Jelly

[Jelly](https://heyjelly.ai) runs OpenCode agents. It reads the `jelly` section of this
package's `package.json` as JSON, without loading the plugin, when a person reviews the exact
version, and uses it as follows.

Jelly names the plugin **Ashby** (`jelly.title`), with the package name and version beneath. Under
that name it shows the one line in `jelly.summary`, and beside it the mark in `jelly.icon`
(`assets/icon.svg`, shipped in the package): Jelly reads that file once, when it records the
plugin, and keeps it only if it is a clean SVG of drawing elements, with no script, style, link
or outside reference. The mark is a neutral funnel on a slate tile, not Ashby's logo. Jelly's
declaration contracts drop a top-level key they don't know, and refuse an unknown key inside a tool,
sign-in or `contributes` entry, so the section uses only the keys Jelly reads.

## Icons and the vendor

`opencode.icons` lists the same mark in three files of this package, in order: `assets/icon.svg`, then
`assets/icon-128.png` and `assets/icon-256.png`, each a raster rendered from that SVG and each with its
MCP `mimeType` and exact `sizes`. `jelly.icon` stays `assets/icon.svg`, the same file as the first entry.
The three files are also exported as `./icon.svg`, `./icon-128.png` and `./icon-256.png`, so a consumer
can resolve them from the installed package, and all three are in the published tarball.

`opencode.vendor` names the service behind the plugin: `{ "id": "ashby", "name": "Ashby", "domain":
"ashbyhq.com" }`. A display app may show the vendor's official logo from the vendor's own site, under
the vendor's terms, using that domain. The package carries no vendor marks: every shipped file is this
family's own drawing, not Ashby's logo, shape or brand colour.

## Tools and permissions

17 tools are declared (12 read-only), every tool in `src/ashby-tools.ts`: each read tool as read-only with
`allow`, each write tool with `ask`, and each denied tool with `deny`. Jelly's agents have no base "allow
everything" rule, so this plugin's own default rules, which it puts after that rule, never reach them. Jelly
writes each declared `ask` or `deny` as that tool's default instead (the person's own choice replaces it), and
denies a read-only helper every tool not marked `readOnly`. A declared `allow` changes nothing in Jelly.

- Ask: `ashby_create_candidate` (a new candidate record), `ashby_consider_candidate_for_job` (adds the candidate to
  a job's pipeline, whose first stage may email them) and `ashby_add_note_to_candidate` (a note the hiring team sees).
- Off: `ashby_change_application_stage` (moves or archives a candidate; archiving can send the automated archive
  email) and `ashby_submit_mcp_feedback` (text sent to Ashby's team).
- Everything else runs, as the plugin's own rules let it.

A tool Ashby adds later, a write included, is not declared, so in Jelly it is not asked about: it runs without asking,
even if it changes something such as a candidate's stage or a pipeline, until a new version of this plugin declares it.
Ashby says it adds tools over time, write actions included. A Jelly admin can set such a tool to ask. Keep
`jelly.tools` in step with `src/ashby-tools.ts`; `test/unit/jelly.test.ts` checks the list against it, and each
declared effect against the plugin's own default rules.

## Skills

Declared: `ashby`, `ashby-write`. Jelly refuses an install whose skill ids collide with another
plugin's or the agent's own; they differ from the Metaview plugin's `metaview`, `metaview-write` and
`metaview-candidate-brief`, which share recruiting questions with them.

## Views

None: `jelly.views` and `jelly.rpc` are empty, and the plugin contributes no Home feed or widget.
A feed of candidates or interviews would put candidate names on a dashboard and call Ashby unasked.

## Signing in

`jelly.signIns` declares one sign-in, `ashby`, for Ashby's MCP server `ashby`, which signs in with OpenCode's MCP OAuth.

Jelly folds the declared sign-in into this plugin's one card, which shows it as Connected, Not signed in or Sign in again (expired or revoked), and starts, renews and signs out of it. An agent's `jelly_connection_request`, or a tool result that names this plugin's "Run /connect and choose …" next step, opens the same card. The plugin still signs in through OpenCode, as it does without Jelly; the declaration only tells Jelly which of the engine's integrations and servers are this plugin's.

## Versions

Jelly's curated catalogue pins an exact version, so publish each release under a new version: a review in Jelly
can then tell the two apart.

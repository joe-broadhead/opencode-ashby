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

16 tools are declared (11 read-only), every tool in `src/ashby-tools.ts`: each read tool read-only, and every tool,
reads and changes alike, `allow`. That matches the family's default, where nothing is denied until the user restricts
it. Jelly's agents have no base "allow everything" rule, so this plugin's own default rules, which it puts after that
rule, never reach them: Jelly writes each declared effect as that tool's default, and the person's own choice replaces
it.

- `ashby_create_candidate` adds a candidate record that everyone with access to candidates sees.
- `ashby_consider_candidate_for_job` adds the candidate to a job's pipeline, whose first stage's automatic activities
  may email them.
- `ashby_add_note_to_candidate` adds a note the profile's readers see.
- `ashby_change_application_stage` moves or archives a candidate; archiving can send them an automated archive email.
- `ashby_submit_mcp_feedback` sends text to Ashby's team.

A Jelly admin restricts one tool by setting its effect to `ask` or `deny` in the card.

A tool Ashby adds later, a write included, is not declared, so in Jelly it runs with the plugin's own default: allowed,
even if it changes something such as a candidate's stage or a pipeline, until a new version of this plugin declares it.
Ashby says it adds tools over time, write actions included. A Jelly admin can set such a tool to ask. Keep
`jelly.tools` in step with `src/ashby-tools.ts`; `test/unit/jelly.test.ts` checks the list against it, and each
declared effect against the plugin's own default rules. `test/unit/live-capture.test.ts` checks the declaration against
Ashby's own tool list for a signed-in user, captured live on 14 November 2026 in `test/fixtures/live-tools.json`
(`provenance.json` says how): every tool Ashby serves is declared, every declared tool is served, and each `readOnly` is
Ashby's `readOnlyHint`. `search_product_docs`, which Ashby's help page lists, is not served, so it is not declared.

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

## Settings

`jelly.contributes.settings` declares one setting, `access`, the option of the same name, as a choice of three:
**Allowed** (`all`, the default), **Ask before changes** (`ask-changes`) and **Read only** (`read-only`), with Jelly's
own line for each. Jelly draws it as a choice, never as free text, and saves only one of the three. A Jelly that does
not know declared choices yet refuses the whole declaration, so this needs a Jelly that does.

## Versions

Jelly's curated catalogue pins an exact version, so publish each release under a new version: a review in Jelly
can then tell the two apart.

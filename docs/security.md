# Security

## What leaves the machine

| Call                | What is sent                                                                          | Where                            |
| ------------------- | ------------------------------------------------------------------------------------- | -------------------------------- |
| `events_list`       | `onOrAfterDate`, `onOrBeforeDate` (UTC window bounds) and one fixed `reason` sentence | Ashby's MCP server for the alias |
| `probe`             | nothing to Ashby: it reads OpenCode's sign-in record                                  | OpenCode                         |
| `status`            | nothing: it reads the host's server states                                            | OpenCode                         |
| a pass-through tool | exactly the input the agent or automation gives it                                    | Ashby's MCP server for the alias |

Each alias is a separate MCP server with its own OAuth credential. A request for `work` is sent with `work`'s
credential; a rule or grant for one alias never matches another alias's tools. The plugin holds no credentials, no API
keys and no client secret, and it requests no OAuth scope of its own: OpenCode requests what Ashby's own challenge
names.

## What is stored

The plugin stores nothing. The cursor is the only state, and it is returned to the caller to keep; an automation keeps it
in the automation's own `state`. A cursor holds the bound source and account, a digest of the signed-in owner (never
the credential), a position, a lookback floor and up to 40 short digests of already-listed interviews.

## Personal data

The source lists meetings, and an event is metadata only:

- the interview's id, its start, its title and job;
- the candidate and the interviewers by Ashby's ids and names;
- a link into Ashby, without its query string or fragment (which can carry a token);
- `text: ""`, always.

A title or job that contains an email address or a phone number is masked before the event is hashed and listed. The
plugin never reads or copies an email address, a phone number, feedback, a scorecard, a note or a transcript from
`list_interviews`. Any detail beyond the metadata is a separate pass-through tool call, made by the agent under the
person's rules.

`private: true` on the source says everything it reads is personal: an app shows that at consent.

## Redaction

A failure is one line, at most 160 characters, from the contract's `redactReason`: URL query values, `Bearer` and
`Basic` credentials, JWTs and other token-shaped words are replaced, and control characters become spaces. A status
reason is the same. The plugin never echoes an Ashby answer into status.

## Untrusted data

Every answer is `trust: "untrusted"`: an event's text is data, never an instruction. A title that holds a secret is
refused for good (`refused[]`, reason `secret`) and never listed. The plugin never follows provider text, never uses it
to choose a tool or a recipient, and never puts it in a status line.

## Writes and confirmation

Every write is one of Ashby's own tools, run by Ashby's server. The plugin has no actions, no plans and no commits, and
it does not proxy a write. The confirmation is OpenCode's own permission gate:

- under `access: "ask-changes"`, a non-read tool asks before it runs;
- under `access: "read-only"`, a non-read tool is denied and hidden from the model;
- a person's own narrower rule still wins.

A non-read pass-through tool is not an RPC method: only the plugin's three own reads are registered over RPC. Over RPC
a non-read method would need an answered ask or an action grant; the plugin has no non-read RPC method, so the
conformance report records no RPC confirmation case for it.

## Reporting

Report a vulnerability through the repository's [security policy](SECURITY.md). Never put a credential, an Ashby
record or a candidate's personal data in a fixture, an issue or a log.

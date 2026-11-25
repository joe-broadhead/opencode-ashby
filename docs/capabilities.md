# Capabilities

The plugin declares 25 methods: three of its own (`status`, `events_list`, `probe`) and 22 pass-through Ashby MCP
tools. One events source (`ashby.interviews`) and one bus event (`changed`). It offers no actions: every write is one of
Ashby's own tools, run by the vendor's server under the person's permission.

<!-- generated:capabilities -->
### Methods

| Method | Class | Accounts | Operations |
|---|---|---|---|
| `status` | read | none | — |
| `events_list` | read | optional | `list_interviews` |
| `probe` | read | optional | — |
| `mcp:add_note_to_candidate` | write | none | `add_note_to_candidate` |
| `mcp:change_application_stage` | send | none | `change_application_stage` |
| `mcp:consider_candidate_for_job` | send | none | `consider_candidate_for_job` |
| `mcp:create_ai_interviewer` | write | none | `create_ai_interviewer` |
| `mcp:create_ai_interviewer_version` | write | none | `create_ai_interviewer_version` |
| `mcp:create_candidate` | write | none | `create_candidate` |
| `mcp:describe_object_fields` | read | none | `describe_object_fields` |
| `mcp:filter_records` | read | none | `filter_records` |
| `mcp:get_ai_interviewer_details` | read | none | `get_ai_interviewer_details` |
| `mcp:get_ai_screening_interview_analytics` | read | none | `get_ai_screening_interview_analytics` |
| `mcp:get_ai_screening_interview_results` | read | none | `get_ai_screening_interview_results` |
| `mcp:get_candidate` | read | none | `get_candidate` |
| `mcp:get_interview_details` | read | none | `get_interview_details` |
| `mcp:get_interview_plan` | read | none | `get_interview_plan` |
| `mcp:get_job_pipeline` | read | none | `get_job_pipeline` |
| `mcp:get_pending_tasks` | read | none | `get_pending_tasks` |
| `mcp:get_record_details` | read | none | `get_record_details` |
| `mcp:get_submitted_feedback` | read | none | `get_submitted_feedback` |
| `mcp:list_interviews` | read | none | `list_interviews` |
| `mcp:search_records_by_name` | read | none | `search_records_by_name` |
| `mcp:submit_mcp_feedback` | send | none | `submit_mcp_feedback` |
| `mcp:update_ai_interviewer_outline` | write | none | `update_ai_interviewer_outline` |

### Sources

| Source | Kind | Reads or output | Method | Cost |
|---|---|---|---|---|
| `ashby.interviews` | events | `meeting` | `events_list` | free |

### Actions

None.

### Bus events

`rpc.ashby.changed`
<!-- /generated:capabilities -->

## The interviews source

`ashby.interviews` reads `list_interviews` for one alias and answers meetings. It is for automations and collectors,
not for answering questions: `events_list` returns a page with a cursor, and every event is untrusted data.

- **Metadata only.** An event carries the interview's own id, its start, its title and job, the candidate and the
  interviewers by Ashby's ids and names, and a link into Ashby without its query or fragment. It never carries an email
  address, a phone number, feedback, a scorecard, a note or a transcript; `text` is always empty. A title or job that
  contains an email address or a phone number is masked, and the event's hash is recomputed over what it shows.
- **A week at a time.** `list_interviews` has no paging, so the source reads a fixed window per call (both bounds
  inclusive, as UTC times): at most 13 windows and 26 calls per page. A window Ashby marks cut short is read again in
  halves, down to one hour; that narrow window that is still cut short is `UNAVAILABLE`, never a shorter week.
- **Settled.** An interview is listed once it started at least 30 minutes ago, so one moved or cancelled at the last
  minute is not; a cancelled interview is never listed.
- **Late arrivals.** With a cursor, the 7 days behind its position are read again, newest part first, for an interview
  that became visible late. The cursor carries a digest of up to 40 interviews already listed inside that lookback, so
  nothing is listed twice. An interview that becomes visible later than the lookback is not listed.
- **Read whole or not at all.** An answer with one entry the plugin cannot read is `UNAVAILABLE`, and the page lists
  nothing: a shorter or empty week is never invented.
- **Free.** The source declares `cost: { class: "free" }` and is private: everything it reads is personal.

## Pass-through tools

Each of Ashby's 22 tools is one `mcp:<tool>` row with its class, so an app knows how risky a call is before it runs,
and one rule per alias. The vendor's server owns the tool and its input; the plugin does not proxy or register it, and
the register refuses a handler for an `mcp:` method. The account is the server name (`ashby`, `ashby-work`, …), which is
why the rows are `accounts: "none"`: the tool takes no `account` argument, and the alias is chosen by the server the
agent calls.

| Class     | Tools                                                                                                                                                                                                                                                                                                                                                        |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| read (14) | `describe_object_fields`, `filter_records`, `get_ai_interviewer_details`, `get_ai_screening_interview_analytics`, `get_ai_screening_interview_results`, `get_candidate`, `get_interview_details`, `get_interview_plan`, `get_job_pipeline`, `get_pending_tasks`, `get_record_details`, `get_submitted_feedback`, `list_interviews`, `search_records_by_name` |
| write (5) | `add_note_to_candidate`, `create_ai_interviewer`, `create_ai_interviewer_version`, `create_candidate`, `update_ai_interviewer_outline`                                                                                                                                                                                                                       |
| send (3)  | `change_application_stage`, `consider_candidate_for_job`, `submit_mcp_feedback`                                                                                                                                                                                                                                                                              |

`consider_candidate_for_job` and `change_application_stage` are `send` because either can email the candidate through
the stage's own automations; `submit_mcp_feedback` reaches Ashby's team. `add_note_to_candidate` is `write`: it can
notify followers, but it does not email the candidate. `update_ai_interviewer_outline` edits a draft only, so it is
`write` even though Ashby marks the call destructive. No row needs an `effect` override: under `ask-changes` a non-read
asks, and under `read-only` it is denied.

## The `changed` event

`changed` is the plugin's one bus event, published as `rpc.ashby.changed`. It says only that a source may have changed:
`{ capability: "ashby.interviews", account: <alias>, reason: "write" }`.

A pass-through write runs in Ashby's server, not in a plugin handler, so the plugin observes it at the tool result: one
`execute.after` hook emits `changed` after a completed non-read `mcp:` tool for an alias. A read, an errored call, or
another plugin's tool emits nothing. The hook adds no text to the model's turn and does not change the result; an app
that receives a nudge re-reads through RPC, which is the truth.

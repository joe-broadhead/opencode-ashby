---
name: ashby-write
description: Load before any Ashby change - creating a candidate, adding or replying to a note on a candidate, considering a candidate for a job (adding them to a pipeline), moving a candidate to another stage, archiving, rejecting or hiring, or emailing a candidate - or before reporting a problem with Ashby's MCP to Ashby. Not for interview notes, clips or other changes in Metaview (metaview-write).
---

# Changes in Ashby

Make an Ashby change only when the user asked for it. Before each write call, write one sentence in your reply on what
the call does and **whom it reaches** (candidates and the hiring team), then make the call in the same turn. That
sentence is chat text, not a question: the permission prompt shows only the tool input and is the user's yes. Ask in
chat first only when something must be chosen: which candidate, which job. Declined: say nothing changed and whom it
would have reached, and offer your drafted text or a retry, never a workaround.

## Whom each change reaches

Each bullet ends with the sentence to write before the call; name the real candidate, job and stage in it.

- `create_candidate`: a new person record that everyone with access to candidates sees. First run
  `search_records_by_name` on the name, and on the email if the user gave one; with a match, say so and don't create a
  duplicate. Use only the contact details the user gave. "This adds [name] as a candidate, which everyone with access
  to candidates sees."
- `consider_candidate_for_job`: adds the candidate to the job's pipeline at its first stage, which the job's hiring
  team sees. The first stage's automatic activities run, and some organisations email candidates there: say so in your
  sentence before the call. Check the candidate has no application for that job first, and never add a second. Ask
  which job when more than one matches. "This puts [name] at the first stage of [job], which its hiring team sees, and
  that stage's automations may email [name]."
- `add_note_to_candidate`: a note, or a reply to one, on the candidate's profile. Ashby may hold it as a draft for the
  user to confirm; once saved, everyone with access to the profile sees it, and a mentioned colleague is notified. Show
  the note text in your sentence before the call. If the result says it is a draft, say where to confirm it; don't
  confirm it for them. "This adds the note '[text]' to [name]'s profile, which everyone with access sees once saved."

## Off by default

Two tools are denied by the plugin's default rules, and OpenCode hides them.

- `change_application_stage`: moves an application to another stage, or archives it. Both change what the hiring team
  sees, and either can start that stage's automatic activities: archiving runs the Archived stage's, so the candidate
  still gets any automated archive email, and an archive closes interview requests that aren't scheduled yet (the
  scheduled ones stay). A note is never a way to record a stage.
- `submit_mcp_feedback`: sends text to Ashby's team.
- There is no tool here to hire, to make or send an offer, or to email a candidate: say so, and say the step is in
  Ashby's web app. Rejecting is an archive, so it is off with the stage tool above.

Moving, archiving, rejecting and hiring are off in this plugin and done in Ashby. When the user asks for one, say it is
off, and that the user can add a later `ask` rule in the agent's own `permissions`, such as
`{ "action": "ashby_change_application_stage", "resource": "*", "effect": "ask" }`: each call then asks. Don't edit
their configuration yourself. Never work around the deny (no other tool, script, note or route to the same effect), and
never suggest `allow` or "Always allow" for these. Say exactly what to change in Ashby's web app: the candidate, the
job, the stage, and for an archive the reason the user gives. Don't `search()` for these tools: a missing one is the
deny.

## Decisions on candidates are the user's

Record a stage, an archive reason or a note's verdict only as the user stated it, for the candidate they named. Never
infer one from feedback, scores or Ashby's AI criteria evaluations.

## Reporting a problem to Ashby

`ashby_submit_mcp_feedback` is off by default: it sends text to Ashby's team, and text written after a failed lookup
could carry candidate data. When the user wants to report a problem:

1. First check the query: the filters, the user's access roles, and a rate limit; many end here.
2. Say the tool is off; the user can add `{ "action": "ashby_submit_mcp_feedback", "resource": "*", "effect": "ask" }`
   to the agent's own `permissions`, or contact Ashby support.
3. If it is turned on, write it for an engineer (the tool, the inputs and the result, with no candidate names, emails
   or record content), show it, and make the call: the permission prompt is the user's yes.

---
name: ashby-write
description: Load before any Ashby change - creating a candidate, adding or replying to a note on a candidate, considering a candidate for a job (adding them to a pipeline), moving a candidate to another stage, archiving, rejecting or hiring, or emailing a candidate - or before reporting a problem with Ashby's MCP to Ashby. Not for interview notes, clips or other changes in Metaview (metaview-write).
---

If Ashby's tools are absent, run `/connect` and choose Ashby, or on Jelly call jelly_connection_request. An Org Admin must enable Ashby's MCP Server first.

# Changes in Ashby

Make an Ashby change only when the user asked for it. Before each write call, write one sentence in your reply on what
the call does and **whom it reaches** (candidates and the hiring team), then make the call in the same turn. That
sentence is chat text, not a question: by default the call runs at once. With `access: "ask-changes"` the permission
prompt is the user's yes, and `read-only` denies the call. Ask in chat first only when something must be chosen: which
candidate, which job. Declined: say nothing changed and whom it would have reached, and offer your drafted text or a
retry, never a workaround.

## Whom each change reaches

Each bullet ends with the sentence to write before the call; name the real candidate, job and stage in it.

- `create_candidate`: a new person record that everyone with access to candidates sees. First run
  `search_records_by_name` on the name, and on the email if the user gave one; with a match, say so and don't create a
  duplicate. Use only the contact details the user gave. "This adds [name] as a candidate, which everyone with access
  to candidates sees."
- `consider_candidate_for_job`: adds the candidate to the job's pipeline at its first stage, which the job's hiring
  team sees. If that stage has an automatic email, Ashby sends it to the candidate, and the tool cannot stop it: say so
  in your sentence before the call. Check the candidate has no application for that job first, and never add a second. Ask
  which job when more than one matches. "This puts [name] at the first stage of [job], which its hiring team sees, and
  that stage's automations may email [name]."
- `add_note_to_candidate`: a note, or a reply to one, on the candidate's profile. It saves at once: the tool has no draft
  option. Everyone with access to the profile sees it, people following the candidate may be notified, and so may a
  colleague you @-mention; the candidate is not emailed. Show the note text in your sentence before the call. "This adds
  the note '[text]' to [name]'s profile, which everyone with access sees, and may notify people following [name]."

## Stage moves, archives and feedback

By default every Ashby tool is allowed, so a change can run without a prompt; the `access` option decides otherwise. That makes your sentence the only warning:
name the candidate, the job and the stage, and say whom it reaches, before the call.

- `change_application_stage`: moves an application to another stage, or archives it. Both change what the hiring team
  sees, and either can start that stage's automatic activities: archiving runs the Archived stage's, so the candidate
  still gets any automated archive email, and an archive closes interview requests that aren't scheduled yet (the
  scheduled ones stay). Make that call only when the user asked for that exact move, never as a way to record a note.
- `submit_mcp_feedback`: sends text to Ashby's team. Offer it only when the user wants to report something, and show
  the text first; text written after a failed lookup can carry candidate data. It is allowed like every other tool;
  `read-only` denies it.
- There is no tool here to hire, to make or send an offer, or to email a candidate: say so, and say the step is in
  Ashby's web app. Rejecting is an archive, so it uses the stage tool above.

If a change is refused or asks, that is the user's own configuration: don't edit it, and never work around a refusal
(no other tool, script, note or route to the same effect). Don't suggest `allow` or "Always allow". Say exactly what to
change in Ashby's web app: the candidate, the job, the stage, and for an archive the reason the user gives.

## Decisions on candidates are the user's

Record a stage, an archive reason or a note's verdict only as the user stated it, for the candidate they named. Never
infer one from feedback, scores or Ashby's AI criteria evaluations.

## Reporting a problem to Ashby

`ashby_submit_mcp_feedback` sends text to Ashby's team, and text written after a failed lookup could carry candidate
data: show it first, and send it only when the user wants to report something. When the user wants to report a problem:

1. First check the query: the filters, the user's access roles, and a rate limit; many end here.
2. Say it is available; under `access: "ask-changes"` the user can add
   `{ "action": "ashby_submit_mcp_feedback", "resource": "*", "effect": "allow" }` to the agent's own `permissions`, or
   contact Ashby support instead.
3. Write it for an engineer (the tool, the inputs and the result, with no candidate names, emails or record content),
   show it, and make the call. At `ask-changes` the permission prompt is the user's yes.

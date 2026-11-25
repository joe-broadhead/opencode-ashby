---

name: ashby-write
description: "Before any Ashby change: create a candidate, add a note, add to a job, move or archive an application, edit an AI screening draft, or report a problem to Ashby. Not for reads."
---

# Changes in Ashby

Make an Ashby change only when the person asked for it. Before each write call, write one sentence in your reply on what
the call does and **whom it reaches** (the candidate and the hiring team), then make the call in the same turn. That
sentence is chat text, not a question: by default the call runs at once. With `access: "ask-changes"` the permission
prompt is the person's yes, and `read-only` denies the call. Ask in chat first only when something must be chosen: which
candidate, which job. Declined: say nothing changed and whom it would have reached, and offer your drafted text or a
retry, never a workaround.

If Ashby's tools are absent, or a call answers `NEEDS_SIGN_IN`, sign in to that account's server: `/connect` and choose
it, or `opencode mcp auth ashby` (and `opencode mcp auth ashby-<alias>` for another alias). With more than one alias,
the tool is the alias's server: `ashby-<alias>_<tool>`.

## Whom each change reaches

Each bullet ends with the sentence to write before the call; name the real candidate, job and stage in it.

- `ashby_create_candidate`: a new person record everyone with access to candidates sees. First run
  `ashby_search_records_by_name` on the name, and on the email if the person gave one; with a match, say so and don't
  create a duplicate. Use only the contact details the person gave. "This adds [name] as a candidate, which everyone
  with access to candidates sees."
- `ashby_consider_candidate_for_job`: adds the candidate to the job's pipeline at its first stage, which the job's
  hiring team sees. If that stage has an automatic email, Ashby sends it to the candidate, and the tool cannot stop it:
  say so before the call. Check the candidate has no application for that job first, and never add a second. Ask which
  job when more than one matches. "This puts [name] at the first stage of [job], which its hiring team sees, and that
  stage's automations may email [name]."
- `ashby_add_note_to_candidate`: a note, or a reply to one, on the candidate's profile. It saves at once: the tool has no
  draft option. Everyone with access to the profile sees it, people following the candidate may be notified, and so may
  a colleague you @-mention; the candidate is not emailed. Show the note text before the call. "This adds the note
  '[text]' to [name]'s profile, which everyone with access sees, and may notify people following [name]."
- `ashby_change_application_stage`: moves an application to another stage, or archives it. Both change what the hiring
  team sees, and either can start that stage's automatic activities: archiving runs the Archived stage's, so the
  candidate still gets any automated archive email, and an archive closes interview requests that aren't scheduled yet
  (the scheduled ones stay). Make that call only when the person asked for that exact move, never to record a note.
  "This moves [name]'s application for [job] to [stage]/archives it, which the hiring team sees, and its automations may
  email [name]."
- `ashby_create_ai_interviewer`, `ashby_create_ai_interviewer_version` and `ashby_update_ai_interviewer_outline`: a
  screening interviewer's draft definition. They change only a **draft**: nothing reaches a candidate until someone
  publishes it and assigns it to a job in Ashby's web app, and no tool here does either. Say that before the call.
  "This changes the draft of [interviewer], which the hiring team sees."
- `ashby_submit_mcp_feedback`: sends text to Ashby's team. Offer it only when the person wants to report something, and
  show the text first; text written after a failed lookup can carry candidate data. Write it for an engineer (the tool,
  the inputs and the result, with no candidate names, emails or record content). "This sends [text] to Ashby's team."

## AI screening drafts

An AI interviewer is a reusable, versioned screening definition (an outline of sections and topics) that jobs can use.

- `ashby_create_ai_interviewer`: a new, blank interviewer with an empty draft outline.
- `ashby_create_ai_interviewer_version`: a new draft version, blank or copied from an existing one. It fails if the
  interviewer already has a draft unless `allowAdditionalDraft: true`, which use only when the person asked for a
  second.
- `ashby_update_ai_interviewer_outline`: adds, edits, removes or duplicates sections and topics in one draft version, up
  to 25 operations per call. Every operation is validated before any write and the rest stop at the first failure, so
  the response says what was applied and what was skipped. Introduction, Minimum Qualifications and Wrap Up are pinned;
  a failed criteria answer in Minimum Qualifications ends the interview, so real dealbreakers go there first.

## No tool here

There is no tool to hire, to make or send an offer, or to email a candidate: say so, and say the step is in Ashby's web
app. Rejecting is an archive, so it uses the stage tool above. Scheduling or rescheduling an interview is Ashby's web
app too.

If a change is refused or asks, that is the person's own configuration: don't edit it, and never work around a refusal
(no other tool, script, note or route to the same effect). Don't suggest "allow" or "Always allow". Say exactly what to
change in Ashby's web app: the candidate, the job, the stage, and for an archive the reason the person gives.

## Decisions on candidates are the person's

Record a stage, an archive reason or a note's verdict only as the person stated it, for the candidate they named. Never
infer one from feedback, scores or Ashby's AI criteria evaluations. Never use a change to record a demographic or
personal attribute the person did not state.

// Every fact the plugin keeps about Ashby's tools: their names, without the `ashby_` server prefix, sorted by what they
// do. The default rules, the tools RPC's methods, status's unknown and denied tools and the tests all derive from these
// lists; `jelly.tools` in package.json and the skills' call examples are checked against them. Keep this file free of
// runtime imports.
//
// The names and classes come from Ashby's own list of its MCP tools (docs.ashbyhq.com, "Ashby MCP Server (Beta)"),
// recorded in test/unit/ashby-tools.json, and from the live server's tool list for a signed-in user (2026-11-20). The
// live list gives each tool's input schema (recorded in PARAMETERS) and its readOnlyHint, and each tool's class comes
// from both and from Ashby's description of it. Ashby may list fewer tools for a user with less access, so a known tool
// missing from a live list is normal and never reported.

/** Known reads: each only reads, by Ashby's description, and sends nothing beyond its query. They run without asking. */
export const READ_TOOLS: readonly string[] = [
  "describe_object_fields",
  "filter_records",
  "get_ai_interviewer_details",
  "get_ai_screening_interview_analytics",
  "get_ai_screening_interview_results",
  "get_candidate",
  "get_interview_details",
  "get_interview_plan",
  "get_job_pipeline",
  "get_pending_tasks",
  "get_record_details",
  "get_submitted_feedback",
  "list_interviews",
  "search_records_by_name",
]

/**
 * Known writes: allowed by default, asked for under `access: "ask-changes"`, and denied under `access: "read-only"`. Each
 * changes records the hiring team sees, and one can reach the candidate:
 * - `consider_candidate_for_job` starts an application at the job's first stage. If that stage has an automatic email (an
 *   activity set to send on stage entry), Ashby sends it to the candidate, and the tool has no option to stop it.
 * - `add_note_to_candidate` saves the note at once: the tool has no draft option. People following the candidate may be
 *   notified, and so may a colleague @-mentioned in the note. The candidate is not emailed.
 * - `create_ai_interviewer`, `create_ai_interviewer_version` and `update_ai_interviewer_outline` change a screening
 *   interviewer's **draft**: a new blank definition, a new version (blank or copied), and the outline's sections and
 *   topics. A draft is not used for screening until it is published and assigned to a job, and no tool here publishes
 *   or assigns one, so none of these reaches a candidate. The hiring team sees the definition, and a draft outline is
 *   edited in place (the server marks the update destructive, but a published version is untouched and the draft can be
 *   edited again).
 */
export const WRITE_TOOLS: readonly string[] = [
  "add_note_to_candidate",
  "consider_candidate_for_job",
  "create_ai_interviewer",
  "create_ai_interviewer_version",
  "create_candidate",
  "update_ai_interviewer_outline",
]

/**
 * The destructive class: allowed like every other tool by default, and what `access: "read-only"` denies and
 * `access: "ask-changes"` asks for each call.
 * - `change_application_stage`: moves an application to another stage, or archives it. Archiving runs the Archived
 *   stage's automatic activities, so the candidate still gets any automated archive email. A decision on a person,
 *   which can't be taken back once the email has gone.
 * - `submit_mcp_feedback`: sends text to Ashby's team, and Ashby invites it whenever something doesn't work.
 */
export const DESTRUCTIVE_TOOLS: readonly string[] = ["change_application_stage", "submit_mcp_feedback"]

/** Every known tool, in the order the default rules list them: the reads, the writes, then the destructive class. */
export const ALL_TOOLS: readonly string[] = [...READ_TOOLS, ...WRITE_TOOLS, ...DESTRUCTIVE_TOOLS]

/**
 * The plugin's own reads, which are tools RPC methods only and never a tool, so not Ashby's and never in a live list:
 * `events_list` and `probe`, the interviews source's two methods (src/events.ts). Their actions, `ashby_events_list` and
 * `ashby_probe`, are allowed like the reads under every `access` value.
 */
export const PLUGIN_METHODS: readonly string[] = ["events_list", "probe"]

/**
 * Each live tool's input parameters, as `name:type`, with `*` after a required name, in the input schema's order. Recorded
 * from the signed-in server's tool schemas (2026-11-10). Every live tool requires a `reason`: one sentence on the user's
 * goal, so a script must send one too. The drift
 * script compares a saved tool list with this record, and the skills test lets a skill write a literal call only with
 * parameters recorded here.
 */
export const PARAMETERS: Readonly<Record<string, readonly string[]>> = {
  add_note_to_candidate: ["candidateId*:string", "noteText*:string", "replyToNoteId:string", "reason*:string"],
  change_application_stage: ["applicationId*:string", "stageId*:string", "archiveReasonId:string", "cancelScheduledInterviews:boolean", "reason*:string"],
  consider_candidate_for_job: ["candidateId*:string", "jobId*:string", "interviewStageId:string", "reason*:string"],
  create_ai_interviewer: ["internalTitle*:string", "externalTitle:string", "reason*:string"],
  create_ai_interviewer_version: ["aiInterviewerId*:string", "source*:string", "copyFromVersionId:string", "label:string", "allowAdditionalDraft:boolean", "reason*:string"],
  create_candidate: ["name*:string", "email:string", "phoneNumber:string", "socialLinks:array<object>", "reason*:string"],
  describe_object_fields: ["objectType*:string", "searchTerm*:string", "limit:number", "cursor:string", "reason*:string"],
  filter_records: ["objectType*:string", "filter*:string", "sort:array<object>", "cursor:string", "resultMode:string", "reason*:string"],
  get_ai_interviewer_details: ["aiInterviewerIds*:array<string>", "outlineDetail:string", "reason*:string"],
  get_ai_screening_interview_analytics: ["aiInterviewerId*:string", "versionId:string", "jobId:string", "dateRange:object", "reason*:string"],
  get_ai_screening_interview_results: ["aiScreeningInterviewIds*:array<string>", "sectionName:string", "topicName:string", "include:array<string>", "reason*:string"],
  get_candidate: ["candidateIds*:array<string>", "sections:array<string>", "offset:number", "limit:number", "applicationIds:array<string>", "reason*:string"],
  get_interview_details: ["interviewEventId*:string", "includeInstructions:boolean", "reason*:string"],
  get_interview_plan: ["applicationId:string", "jobId:string", "reason*:string"],
  get_job_pipeline: ["jobIds*:array<string>", "reason*:string"],
  get_pending_tasks: ["taskTypes:array<string>", "reason*:string"],
  get_record_details: ["entityType*:string", "entityIds*:array<string>", "include:array<string>", "topicName:string", "sectionName:string", "reason*:string"],
  get_submitted_feedback: ["applicationId*:string", "interviewEventId:string", "reason*:string"],
  list_interviews: ["candidateName:string", "onOrAfterDate:string", "onOrBeforeDate:string", "reason*:string"],
  search_records_by_name: ["entityType*:string", "query*:string", "limit:number", "cursor:string", "reason*:string"],
  submit_mcp_feedback: ["feedback*:string", "reason*:string"],
  update_ai_interviewer_outline: ["versionId*:string", "operations*:array<object>", "reason*:string"],
}

type ToolClass = "read" | "write" | "destructive" | "unknown"

export function classify(name: string): ToolClass {
  if (READ_TOOLS.includes(name)) return "read"
  if (WRITE_TOOLS.includes(name)) return "write"
  if (DESTRUCTIVE_TOOLS.includes(name)) return "destructive"
  return "unknown"
}

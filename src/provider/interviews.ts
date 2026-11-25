/**
 * Ashby's `list_interviews` answer, read as interview facts.
 *
 * The envelope was confirmed by a live read on 17 November 2026: `{ data: { interviews, returnedCount, truncated,
 * onOrAfterDate, onOrBeforeDate, message } }`. Only its structure was recorded; the account had no interviews in the
 * window, so an interview's own fields are read from the form the plugin has always read, and anything it cannot read
 * makes the whole answer unreadable. A shorter or empty page is never invented: missing data is unknown.
 *
 * An event is metadata only. It carries the interview's own id, its start, its title and job, the candidate and the
 * interviewers by Ashby's ids and names, and a link into Ashby; never an email address, a phone number, feedback, a
 * scorecard, a note or a transcript. `text` stays empty.
 */
import { type EventActor, makeEvent, type SourceEvent } from "@we-the-rebel-alliance/plugin-contract/events"

/** `list_interviews`, the one Ashby tool the source reads. */
export const LIST_TOOL = "list_interviews"

/**
 * The `reason` every call sends: Ashby requires one sentence on the goal and keeps it out of the result. It names no
 * person and no conversation.
 */
export const LIST_REASON = "List the past interviews Ashby returns for the signed-in user as dated records for their personal timeline."

/** An interview is listed once it started this long ago, so one moved or cancelled at the last minute is not. */
export const SETTLE_MS = 30 * 60_000
/** One `list_interviews` window: a week, both bounds inclusive. */
export const WINDOW_MS = 7 * 86_400_000
/** The most windows one page reads, so a long catch-up stays well inside Ashby's rate limit; the cursor carries on. */
export const MAX_WINDOWS = 13
/** How far behind its position a cursor looks again for an interview that became visible late. */
export const LOOKBACK_MS = 7 * 86_400_000
/** How many listed interviews a cursor remembers inside its lookback: 40 eight-hex digests and a start minute. */
export const MAX_SEEN = 40
/** The calls one page may make, halved windows included. */
export const MAX_CALLS = 26
/** The calls of those the lookback may use; the rest are for what is new. */
export const LOOKBACK_CALLS = 8
/** The narrowest window a cut-short week is split into; a window this narrow that is still cut short fails. */
export const MIN_WINDOW_MS = 3_600_000
/** Interviewers an event keeps: an event has at most 20 actors, and the candidate is one. */
const MAX_INTERVIEWERS = 19

/** Someone on an interview: Ashby's id, a name, or both. Never an email address. */
export interface Person {
  readonly id?: string
  readonly name?: string
}

/** One interview of an answer: only the facts an event carries. */
export interface InterviewFacts {
  readonly id: string
  /** Epoch milliseconds: the interview's start. */
  readonly time: number
  readonly title?: string
  readonly job?: string
  readonly candidate?: Person
  readonly interviewers: readonly Person[]
  readonly url?: string
  readonly cancelled: boolean
}

/** What one answer holds: its interviews, whether it was read whole, and whether Ashby cut it short. */
export interface InterviewsAnswer {
  readonly interviews: readonly InterviewFacts[]
  readonly readable: boolean
  /** Entries the reader could not make an interview of. Any one makes the whole answer unreadable. */
  readonly unreadable: number
  /** Ashby said there is more than it returned. */
  readonly truncated: boolean
}

type Data = Record<string, unknown>
const record = (value: unknown): value is Data => typeof value === "object" && value !== null && !Array.isArray(value)
const text = (value: unknown) =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : typeof value === "number" && Number.isFinite(value) ? String(value) : undefined
const first = <T>(values: readonly (T | undefined)[]): T | undefined => values.find((value) => value !== undefined)

/** Ashby's times: an ISO date-time with Z or an offset. A time without a zone is not read, rather than guessed. */
const ISO_WITH_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:?\d{2})$/
const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/
const TIME_KEYS = ["startTime", "start_time", "startsAt", "startAt", "start", "startDateTime", "scheduledStartTime"] as const

function timeOf(value: unknown): number | undefined {
  const at = typeof value === "string" ? value.trim() : record(value) ? text(value["dateTime"] ?? value["date_time"]) : undefined
  if (!at || !ISO_WITH_ZONE.test(at)) return undefined
  const time = Date.parse(at)
  return Number.isFinite(time) ? time : undefined
}

/** A name, never an email: a value that holds an address is contact data, and is dropped. */
const nameOf = (value: unknown) => {
  const name = text(value)?.replace(/\s+/g, " ")
  return name && !EMAIL.test(name) ? name : undefined
}

/** An Ashby id: one word without spaces. */
const idOf = (value: unknown) => {
  const id = text(value)
  return id && /^[\w.:-]{1,200}$/.test(id) ? id : undefined
}

function person(value: unknown, idKeys: readonly string[]): Person | undefined {
  if (typeof value === "string") {
    const name = nameOf(value)
    return name ? { name } : undefined
  }
  if (!record(value)) return undefined
  const id = first(idKeys.map((key) => idOf(value[key])))
  const joined = [text(value["firstName"]), text(value["lastName"])].filter(Boolean).join(" ")
  const name = first([nameOf(value["name"]), nameOf(value["fullName"]), nameOf(value["displayName"]), nameOf(joined)])
  if (!id && !name) return undefined
  return { ...(id ? { id } : {}), ...(name ? { name } : {}) }
}

/**
 * A link into Ashby: https on ashbyhq.com or one of its subdomains, without credentials, query or fragment, which may
 * carry a token or a tracking parameter. A meeting link (a call's URL) is never kept.
 */
export function ashbyUrl(value: unknown): string | undefined {
  const raw = text(value)
  if (!raw) return undefined
  try {
    const url = new URL(raw)
    const host = url.hostname.toLowerCase()
    if (url.protocol !== "https:" || url.username || url.password || !(host === "ashbyhq.com" || host.endsWith(".ashbyhq.com"))) return undefined
    return `${url.origin}${url.pathname.replace(/\/+$/, "")}`
  } catch {
    return undefined
  }
}

/** A phone number: 9 to 15 digits, with spaces, dots, dashes, brackets or a leading +, not inside a word or a URL. */
const PHONE = /(?<![\w/=#?&.:-])\+?\(?\d(?:[\s().-]*\d){8,14}(?![\w/])/g
const DATE = /^\d{4}-\d{2}-\d{2}/

/** Text with every email address and phone number masked: a title or a job can carry a candidate's. */
export function maskContacts(value: string): string {
  return value.replace(EMAIL, "[email]").replace(PHONE, (match) => (DATE.test(match) ? match : "[phone]"))
}

/** One interview from a JSON object Ashby answered with; undefined without an id or a start with a zone. */
function interviewFromObject(item: Data): InterviewFacts | undefined {
  const event = record(item["interviewEvent"]) ? item["interviewEvent"] : {}
  const interview = record(item["interview"]) ? item["interview"] : {}
  const job = record(item["job"]) ? item["job"] : {}
  // Only the documented key: list_interviews returns `interviewEventId`, which get_interview_details takes. A bare `id`
  // may be another record's (a schedule's), so an entry without the key is unreadable rather than guessed.
  const id = first([idOf(item["interviewEventId"]), idOf(event["id"])])
  const time = first([...TIME_KEYS.map((key) => timeOf(item[key])), ...TIME_KEYS.map((key) => timeOf(event[key]))])
  if (!id || time === undefined) return undefined
  const title = first([
    text(item["interviewTitle"]),
    text(item["interviewName"]),
    text(item["title"]),
    text(item["name"]),
    text(interview["title"]),
    text(interview["name"]),
  ])
  const jobTitle = first([
    text(item["jobTitle"]),
    text(item["jobName"]),
    text(job["title"]),
    text(job["name"]),
    typeof item["job"] === "string" ? text(item["job"]) : undefined,
  ])
  const candidate = person(item["candidate"], ["id", "candidateId"]) ?? person({ id: item["candidateId"], name: item["candidateName"] }, ["id"])
  const panel = first(["interviewers", "interviewerUsers", "panel"].map((key) => (Array.isArray(item[key]) ? (item[key] as unknown[]) : undefined))) ?? []
  const status = `${text(item["status"]) ?? ""} ${text(event["status"]) ?? ""}`
  const url = first(["url", "link", "ashbyUrl", "interviewUrl", "candidateUrl", "applicationUrl", "profileUrl"].map((key) => ashbyUrl(item[key])))
  return {
    id,
    time,
    ...(title ? { title } : {}),
    ...(jobTitle ? { job: jobTitle } : {}),
    ...(candidate ? { candidate } : {}),
    interviewers: panel.flatMap((entry) => person(entry, ["id", "userId"]) ?? []),
    ...(url ? { url } : {}),
    cancelled: /cancel/i.test(status) || item["isCancelled"] === true || item["cancelled"] === true,
  }
}

/** The window an answer says it covered, as UTC times; undefined when it names none, `unreadable` when a bound has no zone. */
function echoedWindow(inner: Data): { readonly from: number; readonly to: number } | "unreadable" | undefined {
  const [after, before] = [inner["onOrAfterDate"], inner["onOrBeforeDate"]]
  if (after === undefined && before === undefined) return undefined
  const from = timeOf(after)
  const to = timeOf(before)
  return from === undefined || to === undefined ? "unreadable" : { from, to }
}

/** The whole of a sentence that a window has no interviews, such as "No interviews found." Nothing more may follow. */
const NONE =
  /^(?:there are )?no (?:upcoming |scheduled |past )?interviews?(?: (?:were )?found)?(?: (?:for|in) (?:this|the|that) (?:window|period|date range|time range|range))?\.?$/i

/**
 * An answer, read whole or not at all. One entry the reader cannot make an interview of makes the whole answer
 * unreadable, so no interview is dropped while a cursor moves past it. An empty answer is unknown, never an empty week:
 * only the recorded envelope's list, or a whole "no interviews" sentence, says there were none.
 */
export function readInterviews(data: unknown, window?: { readonly from: number; readonly to: number }): InterviewsAnswer {
  const answer = (interviews: readonly InterviewFacts[], unreadable: number, truncated = false): InterviewsAnswer => ({
    interviews,
    readable: unreadable === 0,
    unreadable,
    truncated,
  })
  const fromList = (list: readonly unknown[], truncated = false): InterviewsAnswer => {
    const interviews = list.flatMap((item) => (record(item) ? (interviewFromObject(item) ?? []) : []))
    return answer(interviews, list.length - interviews.length, truncated)
  }
  if (record(data) && record(data["data"])) {
    const inner = data["data"]
    const list = inner["interviews"]
    if (!Array.isArray(list)) {
      return typeof inner["message"] === "string" && NONE.test(inner["message"].trim()) && inner["returnedCount"] === undefined ? answer([], 0) : answer([], 1)
    }
    const read = fromList(list)
    const count = inner["returnedCount"]
    // A count that is not the list's length is an answer this plugin does not understand.
    if (count !== undefined && count !== list.length) return answer(read.interviews, Math.max(1, read.unreadable))
    const bounds = echoedWindow(inner)
    if (bounds === "unreadable") return answer(read.interviews, Math.max(1, read.unreadable))
    // Cut short: Ashby's own flag, or a window narrower than the one asked for.
    const narrower = window !== undefined && bounds !== undefined && (bounds.from > window.from + 1000 || bounds.to < window.to - 1000)
    return answer(read.interviews, read.unreadable, inner["truncated"] === true || narrower)
  }
  if (Array.isArray(data)) return fromList(data)
  if (record(data) && Array.isArray(data["interviews"])) return fromList(data["interviews"], data["truncated"] === true)
  const body = typeof data === "string" ? data.trim() : ""
  if (body === "") return answer([], 1)
  return NONE.test(body) ? answer([], 0) : answer([], 1)
}

const actorOf = (role: "candidate" | "interviewer", who: Person): EventActor => ({
  role,
  id: who.id ? `ashby:${role === "candidate" ? "candidate" : "user"}:${who.id}` : `name:${encodeURIComponent(who.name!)}`,
  ...(who.name ? { name: who.name } : {}),
})

/** One interview as a meeting event, with its raw title; the handler masks contacts before it is listed. */
export function toEvent(interview: InterviewFacts, account: string): SourceEvent {
  const seen = new Set<string>()
  const actors = [
    ...(interview.candidate ? [actorOf("candidate", interview.candidate)] : []),
    ...interview.interviewers.slice(0, MAX_INTERVIEWERS).map((who) => actorOf("interviewer", who)),
  ].filter((actor) => !seen.has(actor.id) && seen.add(actor.id))
  const title = interview.title ?? "Interview"
  return makeEvent({
    source: "ashby",
    account,
    external_id: interview.id,
    kind: "meeting",
    occurred_at: interview.time,
    thread: null,
    actors,
    title: interview.job && interview.job !== title ? `${title} — ${interview.job}` : title,
    text: "",
    url: interview.url ?? null,
    labels: [],
  })
}

/**
 * The same event with every email address and phone number masked out of its title, and its hash recomputed. A title or
 * a job can carry a candidate's contact details; an event is metadata only.
 */
export function maskEvent(event: SourceEvent): SourceEvent {
  const title = maskContacts(event.title)
  if (title === event.title) return event
  return makeEvent({
    source: event.source,
    account: event.account,
    external_id: event.external_id,
    kind: "meeting",
    occurred_at: event.occurred_at,
    thread: null,
    actors: event.actors.map((actor) => ({ role: actor.role, id: actor.id, ...(actor.name === undefined ? {} : { name: actor.name }) })),
    title,
    text: "",
    url: event.url,
    labels: [],
  })
}

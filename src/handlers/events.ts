/**
 * `events_list` (`contract §7`): the interviews Ashby's `list_interviews` returns for one account, as meeting events.
 *
 * One provider tool has no paging, so the source reads a week at a time (`onOrAfterDate` and `onOrBeforeDate`, both
 * inclusive, as UTC times), at most 13 weeks and 26 calls per page, and reads a week Ashby cuts short again in halves
 * down to one hour. With a cursor it first reads the 7 days behind the cursor's position again, newest part first, on
 * at most 8 calls, for an interview that became visible late; the cursor carries its lookback floor and a digest of up
 * to 40 interviews already listed, so nothing is listed twice and the position never moves back. An interview is listed
 * once it started at least 30 minutes ago and never when it is cancelled. Each event carries metadata only.
 *
 * A page that cannot be read whole is `UNAVAILABLE`, never a shorter or empty week: missing data is unknown, never zero.
 */
import { createHash } from "node:crypto"
import { decodeBoundCursor, encodeBoundCursor } from "@we-the-rebel-alliance/plugin-contract/cursor"
import {
  type EventsListResult,
  eventsListResult,
  fitPage,
  parseEventsListInput,
  type SourceEvent,
  screenEvents,
  startTime,
} from "@we-the-rebel-alliance/plugin-contract/events"
import { RegisterError, refusal } from "@we-the-rebel-alliance/plugin-contract/register"
import { PLUGIN } from "../accounts.ts"
import { packageName } from "../manifest.ts"
import type { Provider, ProviderCall } from "../provider/index.ts"
import {
  type InterviewFacts,
  type InterviewsAnswer,
  LIST_REASON,
  LIST_TOOL,
  LOOKBACK_CALLS,
  LOOKBACK_MS,
  MAX_CALLS,
  MAX_SEEN,
  MAX_WINDOWS,
  MIN_WINDOW_MS,
  maskEvent,
  readInterviews,
  SETTLE_MS,
  toEvent,
  WINDOW_MS,
} from "../provider/interviews.ts"

/** The source every event names, and the `source` input the descriptor gives. */
export const SOURCE = "ashby"
/** The descriptor's id for it. */
export const SOURCE_ID = "ashby.interviews"

const CURSOR_NEXT = "Pass a cursor from a previous result for the same account, or start again with since."
const UPDATE_NEXT = "Call events_list again with the same cursor; if it keeps failing, call status and update the plugin if a newer release is out."

/** How far the source may read. `maxBytes` is the manifest's own bound for the source. */
export interface EventsOptions {
  readonly provider: Provider
  readonly maxBytes: number
  readonly now: () => number
}

/** What a cursor is bound to: this plugin, its one source and the call's account. */
export function binding(account: string): { readonly plugin: string; readonly source: string; readonly account: string } {
  return { plugin: PLUGIN, source: SOURCE, account }
}

interface Key {
  readonly t: number
  readonly i: string
}

const compare = (a: Key, b: Key) => a.t - b.t || (a.i < b.i ? -1 : a.i > b.i ? 1 : 0)
const digest = (owner: { readonly id: string }) => createHash("sha256").update(owner.id).digest("hex").slice(0, 16)
const isoFloor = (time: number) => new Date(Math.floor(time / 1000) * 1000).toISOString()
const isoCeil = (time: number) => new Date(Math.ceil(time / 1000) * 1000).toISOString()

const SEEN_ENTRY = 11
const MINUTE = 60_000

/** An id's digest in the cursor's seen list. */
const seenDigest = (id: string) => createHash("sha256").update(id).digest("hex").slice(0, 8)

interface CursorState {
  readonly key: Key
  readonly owner: string
  /** The lookback's floor: every interview listed that started after it, and up to the position, is in `seen`. */
  readonly floor: number
  /** Digest → the minute it started (epoch minutes). */
  readonly seen: ReadonlyMap<string, number>
}

/**
 * The state a cursor holds. Anything that is not this source's bound cursor for this account, with a position, an
 * owner digest, a lookback floor and a seen list, is `CURSOR_INVALID`, and the caller starts again with `since`.
 */
function cursorState(account: string, cursor: string): CursorState {
  const decoded = decodeBoundCursor(binding(account), cursor)
  const state = decoded.ok ? decoded.state : undefined
  const [t, i, o, f, list] = [state?.["t"], state?.["i"], state?.["o"], state?.["f"], state?.["d"]]
  const valid =
    typeof t === "number" &&
    Number.isSafeInteger(t) &&
    typeof i === "string" &&
    i.length <= 512 &&
    typeof o === "string" &&
    /^[0-9a-f]{16}$/.test(o) &&
    typeof f === "number" &&
    Number.isSafeInteger(f) &&
    f <= t &&
    typeof list === "string" &&
    list.length <= SEEN_ENTRY * MAX_SEEN &&
    /^(?:[0-9a-f]{8}[0-9a-z]{3})*$/.test(list)
  if (!valid) throw new RegisterError(refusal("CURSOR_INVALID", "the cursor was not issued by this source for this account", CURSOR_NEXT))
  const base = Math.floor(f / MINUTE)
  const seen = new Map<string, number>()
  for (let at = 0; at < list.length; at += SEEN_ENTRY) seen.set(list.slice(at, at + 8), base + Number.parseInt(list.slice(at + 8, at + SEEN_ENTRY), 36))
  return { key: { t, i }, owner: o, floor: f, seen }
}

/**
 * The next cursor's lookback: the floor moves to `LOOKBACK_MS` behind the new position (never back), the seen list keeps
 * what started after it, and when that is more than `MAX_SEEN`, only the newest, with the floor moved past the rest but
 * never past the position, so the cursor is always one this source accepts.
 */
function nextLookback(floor: number, position: number, seen: ReadonlyMap<string, number>): { readonly floor: number; readonly list: string } {
  let next = Math.max(floor, position - LOOKBACK_MS)
  // A minute's entry may be any time in that minute, so it is dropped only when the whole minute is at or before the floor.
  let kept = [...seen].filter(([, minute]) => (minute + 1) * MINUTE > next).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
  if (kept.length > MAX_SEEN) {
    next = Math.min(position, Math.max(next, (kept[MAX_SEEN]![1] + 1) * MINUTE))
    kept = kept.slice(0, MAX_SEEN).filter(([, minute]) => minute * MINUTE >= next)
  }
  const base = Math.floor(next / MINUTE)
  return { floor: next, list: kept.map(([key, minute]) => `${key}${(minute - base).toString(36).padStart(3, "0")}`).join("") }
}

/** One part of a page's calls so far, and its limit. */
interface Budget {
  calls: number
  readonly limit: number
}

/** Runs `list_interviews` for one account, and returns its answer. */
type List = (input: Readonly<Record<string, unknown>>) => Promise<unknown>

/** An answer this plugin does not read is `UNAVAILABLE`, and nothing of the page is listed. */
function readable(answer: InterviewsAnswer): InterviewsAnswer {
  if (answer.readable) return answer
  const counted = answer.interviews.length + answer.unreadable
  const what = counted > 1 ? `${answer.unreadable} of ${counted} entries` : "an answer"
  throw new RegisterError(
    refusal(
      "UNAVAILABLE",
      `Ashby's ${LIST_TOOL} answered with ${what} in a form this plugin does not read, so no interview of this page is listed`,
      UPDATE_NEXT,
    ),
  )
}

/**
 * The lookback's read: every interview that started within [from, to], newest part first, so when Ashby cuts it short
 * more often than its calls allow, the part nearest the cursor, where a late arrival is likeliest, is the part read.
 */
async function listWindowBack(
  list: List,
  from: number,
  to: number,
  budget: Budget,
): Promise<{ readonly interviews: readonly InterviewFacts[]; readonly from: number }> {
  if (budget.calls >= budget.limit) return { interviews: [], from: to }
  budget.calls++
  const answer = readable(readInterviews(await list({ onOrAfterDate: isoFloor(from), onOrBeforeDate: isoCeil(to), reason: LIST_REASON }), { from, to }))
  if (answer.truncated) {
    if (to - from <= MIN_WINDOW_MS) throw new RegisterError(refusal("UNAVAILABLE", `Ashby's ${LIST_TOOL} cut short the interviews of one hour`, UPDATE_NEXT))
    const middle = from + Math.floor((to - from) / 2)
    const late = await listWindowBack(list, middle, to, budget)
    if (late.from > middle) return late
    const early = await listWindowBack(list, from, middle, budget)
    return { interviews: [...early.interviews, ...late.interviews], from: early.from }
  }
  return { interviews: answer.interviews.filter((interview) => !interview.cancelled && interview.time >= from && interview.time <= to), from }
}

/**
 * Every interview that started within [from, to], not cancelled, read whole: one `list_interviews` call, and when Ashby
 * marks the answer cut short, the two halves of the window instead, down to `MIN_WINDOW_MS`.
 */
async function listWindow(
  list: List,
  from: number,
  to: number,
  budget: Budget,
): Promise<{ readonly interviews: readonly InterviewFacts[]; readonly to: number }> {
  if (budget.calls >= budget.limit) return { interviews: [], to: from }
  budget.calls++
  const answer = readable(readInterviews(await list({ onOrAfterDate: isoFloor(from), onOrBeforeDate: isoCeil(to), reason: LIST_REASON }), { from, to }))
  if (answer.truncated) {
    if (to - from <= MIN_WINDOW_MS) throw new RegisterError(refusal("UNAVAILABLE", `Ashby's ${LIST_TOOL} cut short the interviews of one hour`, UPDATE_NEXT))
    const middle = from + Math.floor((to - from) / 2)
    const early = await listWindow(list, from, middle, budget)
    if (early.to < middle) return early
    const late = await listWindow(list, middle, to, budget)
    // The early half ends where the late half starts; an interview at that instant is read twice and kept once.
    return {
      interviews: [
        ...early.interviews,
        ...late.interviews.filter((interview) => interview.time > middle || !early.interviews.some((seen) => seen.id === interview.id)),
      ],
      to: late.to,
    }
  }
  return { interviews: answer.interviews.filter((interview) => !interview.cancelled && interview.time >= from && interview.time <= to), to }
}

/**
 * One page of events for one account. The input, the cursor and the sign-in are checked before any read; with a cursor,
 * the lookback behind its position is read again first, and an interview there that the cursor does not remember is
 * listed now.
 */
export async function listEvents(options: EventsOptions, call: ProviderCall, input: unknown): Promise<EventsListResult> {
  const parsed = parseEventsListInput(input)
  if (!parsed.ok)
    throw new RegisterError(
      refusal(
        "INPUT_INVALID",
        `the events_list input is invalid: ${parsed.problems.join("; ")}`,
        "Pass only since, cursor, limit and source, as the method's schema describes.",
      ),
    )
  const request = parsed.value
  if (request.source !== undefined && request.source !== SOURCE) {
    throw new RegisterError(refusal("SOURCE_UNKNOWN", `this plugin lists one source, ${SOURCE}`, `Leave source out, or pass "${SOURCE}".`))
  }
  const cursor = request.cursor === undefined ? undefined : cursorState(call.account, request.cursor)
  const owner = await options.provider.owner(call.account)
  const ownerDigest = digest(owner)
  if (cursor !== undefined && cursor.owner !== ownerDigest) {
    throw new RegisterError(
      refusal(
        "ACCOUNT_MISMATCH",
        "the cursor was issued for another Ashby sign-in than the one OpenCode holds now",
        "Call probe to see who is signed in, then start again with since.",
      ),
    )
  }
  const now = options.now()
  const after: Key = cursor?.key ?? { t: startTime(request, now), i: "" }
  const floor = cursor?.floor ?? after.t
  const seen = new Map(cursor?.seen ?? [])
  const end = now - SETTLE_MS
  const found = new Map<string, InterviewFacts>()
  const list: List = (window) => options.provider.listInterviews(call, window)

  // The lookback (floor, position]: an interview there the cursor does not remember is a late arrival. It is read first,
  // newest part first, on its own few calls, so it never keeps the page from what is new.
  let readFloor = floor
  if (floor < after.t) {
    const back = await listWindowBack(list, floor, after.t, { calls: 0, limit: LOOKBACK_CALLS })
    for (const interview of back.interviews) {
      if (interview.time > floor && compare({ t: interview.time, i: interview.id }, after) <= 0 && !seen.has(seenDigest(interview.id)))
        found.set(interview.id, interview)
    }
    if (back.from > floor) readFloor = back.from - 1
  }

  const budget: Budget = { calls: 0, limit: MAX_CALLS - LOOKBACK_CALLS }
  let scanned = after.t
  for (let from = after.t, windows = 0; from <= end && windows < MAX_WINDOWS && found.size <= request.limit; windows++) {
    const to = Math.min(from + WINDOW_MS, end)
    const read = await listWindow(list, from, to, budget)
    for (const interview of read.interviews) if (compare({ t: interview.time, i: interview.id }, after) > 0) found.set(interview.id, interview)
    scanned = read.to
    // Out of calls inside this window: stop where it was read whole, so the cursor moves that far and no further.
    if (read.to < to || to >= end) break
    from = to
  }

  const ordered = [...found.values()].sort((a, b) => compare({ t: a.time, i: a.id }, { t: b.time, i: b.id }))
  const chosen = ordered.slice(0, request.limit)
  // An interview whose title holds a secret is refused for good; the rest fill the page up to its size. Screening reads
  // the event as Ashby gave it: masking first could turn a credential into a plain "[email]" that no longer looks like
  // one. Only what is listed is masked, and its hash is recomputed with its title.
  const screened = screenEvents(chosen.map((interview) => toEvent(interview, call.account)))
  const listed: SourceEvent[] = screened.events.map(maskEvent)
  const fits = fitPage(listed, request.limit, options.maxBytes)
  const page = listed.slice(0, fits)
  const index = new Map(chosen.map((interview, position) => [interview.id, position]))
  // The last interview this page accounts for: every chosen one when the whole screened list fits, so a refused one at
  // the end is passed too; otherwise the last listed.
  const last = fits === screened.events.length ? chosen.length - 1 : index.get(page[fits - 1]!.external_id)!
  const refused = screened.refused.filter((entry) => index.get(entry.external_id)! <= last)
  const accounted = chosen.slice(0, last + 1)
  const more = ordered.length > accounted.length || scanned < end
  // Late arrivals sort before what is new, so the position moves only on what is new, and never back.
  const newest = accounted.filter((interview) => compare({ t: interview.time, i: interview.id }, after) > 0).at(-1)
  const position: Key = newest ? { t: newest.time, i: newest.id } : accounted.length === ordered.length && scanned > after.t ? { t: scanned, i: "" } : after
  for (const interview of accounted) seen.set(seenDigest(interview.id), Math.floor(interview.time / MINUTE))
  const lookback = nextLookback(readFloor, position.t, seen)
  const next = encodeBoundCursor(binding(call.account), { o: ownerDigest, t: position.t, i: position.i, f: lookback.floor, d: lookback.list })
  return eventsListResult({ source: SOURCE, account: call.account, owner }, page, next, more, {
    refused,
    plugin: packageName,
    asOf: new Date(now).toISOString(),
  })
}

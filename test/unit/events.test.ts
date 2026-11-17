// The interviews source, events_list and probe, against invented interviews (test/fixtures/conformance.json, and the
// cases below): list_interviews filters by `onOrAfterDate` and `onOrBeforeDate`, both inclusive, and answers JSON, or
// markup, or a sentence. No live answer of list_interviews has been recorded, so these are the forms the reader
// accepts, and anything else must fail loudly. Every person, job, id and link is made up.
import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { encodeBoundCursor } from "@we-the-rebel-alliance/source-contract/cursor"
import { EVENT_LIMITS, PAGE, assertEventsListConformance, probeResultProblems, resultProblems, type EventsListResult } from "@we-the-rebel-alliance/source-contract/events"
import { registerToolsRpc } from "@we-the-rebel-alliance/source-contract/tools-rpc"
import {
  ACCOUNT,
  BINDING,
  EVENTS_ACTION,
  EVENTS_INPUT,
  EventsFailure,
  LIST_REASON,
  LIST_TOOL,
  LOOKBACK_CALLS,
  LOOKBACK_MS,
  MAX_BYTES,
  MAX_CALLS,
  MAX_SEEN,
  MAX_WINDOWS,
  MIN_WINDOW_MS,
  PROBE_ACTION,
  SETTLE_MS,
  SOURCE,
  WINDOW_MS,
  ashbyProbe,
  ashbyUrl,
  eventsMethod,
  listEvents,
  probeMethod,
  readInterviews,
  resultData,
  signedIn,
  type EventsContext,
} from "../../src/events.js"
import { defaultRules, evaluate } from "../../src/permissions.js"
import { PLUGIN } from "../../src/tools-rpc.js"

interface Fixture {
  readonly now: string
  readonly since: string
  readonly interviews: readonly Record<string, unknown>[]
}
const FIXTURE = JSON.parse(readFileSync(new URL("../fixtures/conformance.json", import.meta.url), "utf8")) as Fixture
const NOW = Date.parse(FIXTURE.now)
const SINCE = FIXTURE.since
/** OpenCode's sign-in: the credential's id, labelled with its label (an email here, which never becomes the id). */
const OWNER = { id: "ashby:credential:cred-1", label: "ada@example.test" }
/** Listed from SINCE: not ie-0003 (a secret in its title), ie-0005 (cancelled), ie-0007 (too recent) or ie-0008 (ahead). */
const EXPECTED = ["ie-0001", "ie-0002", "ie-0004a", "ie-0004b", "ie-0006"]
const SECRET = "ie-0003"

/** list_interviews over `interviews`, both bounds inclusive, answering with `answer`. */
function ashby(interviews: readonly Record<string, unknown>[] = FIXTURE.interviews, answer: (found: Record<string, unknown>[]) => unknown = (found) => ({ interviews: found })) {
  const calls: Record<string, unknown>[] = []
  const list = async (input: Record<string, unknown>) => {
    calls.push(input)
    const from = Date.parse(String(input["onOrAfterDate"]))
    const to = Date.parse(String(input["onOrBeforeDate"]))
    return answer(interviews.filter((interview) => Date.parse(String(interview["startTime"])) >= from && Date.parse(String(interview["startTime"])) <= to))
  }
  return { list, calls }
}

const list = (fake = ashby(), now = NOW, owner: typeof OWNER | undefined = OWNER) => (input: unknown) => listEvents(fake.list, owner, input, now)
const code = async (promise: Promise<unknown>) => {
  try {
    await promise
    return undefined
  } catch (error) {
    return error instanceof EventsFailure ? error.code : String(error)
  }
}

describe("list_interviews' answer", () => {
  test("reads each interview's id, start, title, job, candidate, interviewers and Ashby link, and never an email", () => {
    const { interviews, readable } = readInterviews({ interviews: FIXTURE.interviews.slice(0, 1) })
    expect(readable).toBe(true)
    expect(interviews).toEqual([
      {
        id: "ie-0001",
        time: Date.parse("2026-10-01T09:00:00Z"),
        title: "Hiring manager screen",
        job: "Platform Engineer",
        candidate: { id: "cand-0001", name: "Casey Sample" },
        interviewers: [{ id: "user-0001", name: "Ada Example" }],
        url: "https://app.ashbyhq.com/interviews/ie-0001",
        cancelled: false,
      },
    ])
    expect(JSON.stringify(interviews)).not.toContain("@")
    expect(JSON.stringify(interviews)).not.toContain("meet.example.net")
  })

  test("reads a bare array, the candidate's flat fields, a first and last name, and a cancelled status", () => {
    const { interviews } = readInterviews(FIXTURE.interviews.slice(3, 6))
    expect(interviews.map((interview) => [interview.id, interview.candidate, interview.interviewers, interview.cancelled])).toEqual([
      ["ie-0004a", { id: "cand-0004", name: "Frankie Sample" }, [{ id: "user-0003", name: "Gus Placeholder" }], false],
      ["ie-0004b", { id: "cand-0004", name: "Frankie Sample" }, [{ name: "Hana Example" }], false],
      ["ie-0005", { id: "cand-0005", name: "Ira Sample" }, [{ id: "user-0002", name: "Bo Placeholder" }], true],
    ])
  })

  test("reads markup: one element per interviewEventId, with its Candidate and Interviewer elements", () => {
    const markup = [
      "<Interviews>",
      '  <Interview interviewEventId="ie-m1" title="Pairing &amp; review" jobTitle="Data Analyst" startTime="2026-10-03T10:00:00Z">',
      '    <Candidate id="cand-m1" name="Lee Sample" email="lee@example.test" />',
      '    <Interviewer id="user-m1" name="Ada Example" email="ada@example.test" />',
      "  </Interview>",
      '  <Interview interviewEventId="ie-m2" title="Screen" startTime="2026-10-04T10:00:00Z" status="CANCELLED" />',
      "</Interviews>",
    ].join("\n")
    const { interviews, readable } = readInterviews(markup)
    expect(readable).toBe(true)
    expect(interviews).toEqual([
      { id: "ie-m1", time: Date.parse("2026-10-03T10:00:00Z"), title: "Pairing & review", job: "Data Analyst", candidate: { id: "cand-m1", name: "Lee Sample" }, interviewers: [{ id: "user-m1", name: "Ada Example" }], cancelled: false },
      { id: "ie-m2", time: Date.parse("2026-10-04T10:00:00Z"), title: "Screen", interviewers: [], cancelled: true },
    ])
  })

  test("an empty answer, or a whole sentence that there are none, is an empty week; any other form is unreadable", () => {
    for (const empty of [{ interviews: [] }, [], "", "No interviews found for this window.", "No interviews", "There are no upcoming interviews."]) {
      expect(readInterviews(empty)).toEqual({ interviews: [], readable: true, unreadable: 0, truncated: false })
    }
    for (const unknown of [
      { message: "ok" },
      [{ eventId: "x" }],
      "Here is your schedule: Monday at 9",
      "Showing interviews; no further interviews after these: Onsite with N",
      "No interviews found. 3 interviews were hidden.",
      { interviews: [{ interviewEventId: "x", startTime: "Oct 1" }] },
    ]) {
      expect({ unknown, readable: readInterviews(unknown).readable }).toEqual({ unknown, readable: false })
    }
  })

  test("every entry must be an interview: one it cannot read makes the whole answer unreadable", () => {
    const good = FIXTURE.interviews[0]!
    for (const bad of [
      { ...good, interviewEventId: "ie-x", startTime: undefined, scheduledAt: "2026-10-01T10:00:00Z" },
      { ...good, interviewEventId: "ie-x", startTime: "2026-10-01T10:00:00" },
      "ie-x",
    ]) {
      expect(readInterviews({ interviews: [good, bad] })).toMatchObject({ readable: false, unreadable: 1 })
      expect(readInterviews([bad, good])).toMatchObject({ readable: false, unreadable: 1 })
    }
    const markup = '<Interviews><Interview interviewEventId="ie-m1" startTime="2026-10-03T10:00:00Z" /><Interview interviewEventId="ie-m2" startTime="Oct 4" /></Interviews>'
    expect(readInterviews(markup)).toMatchObject({ readable: false, unreadable: 1 })
  })

  test("takes the interview event id only from interviewEventId, never a bare id", () => {
    expect(readInterviews([{ id: "sched-1", startTime: "2026-10-01T09:00:00Z" }])).toMatchObject({ interviews: [], readable: false })
    expect(readInterviews([{ interviewEvent: { id: "ie-n", startTime: "2026-10-01T09:00:00Z" }, id: "sched-1" }]).interviews.map((interview) => interview.id)).toEqual(["ie-n"])
  })

  test("notices Ashby's markers for an answer cut short: a more flag, a next cursor, or a total above what it lists", () => {
    const one = [FIXTURE.interviews[0]!]
    for (const marked of [{ hasMore: true }, { truncated: true }, { moreDataAvailable: "true" }, { nextCursor: "c2" }, { totalCount: 5 }]) {
      expect({ marked, truncated: readInterviews({ interviews: one, ...marked }).truncated }).toEqual({ marked, truncated: true })
    }
    for (const whole of [{}, { hasMore: false }, { nextCursor: null }, { count: 1 }]) expect({ whole, truncated: readInterviews({ interviews: one, ...whole }).truncated }).toEqual({ whole, truncated: false })
    expect(readInterviews('<Interviews hasMore="true"><Interview interviewEventId="ie-m1" startTime="2026-10-03T10:00:00Z" /></Interviews>').truncated).toBe(true)
  })

  test("never reads a start without a zone, and keeps only https links on ashbyhq.com", () => {
    expect(readInterviews([{ interviewEventId: "x", startTime: "2026-10-01T09:00:00" }]).interviews).toEqual([])
    expect(ashbyUrl("https://app.ashbyhq.com/x")).toBe("https://app.ashbyhq.com/x")
    for (const url of ["http://app.ashbyhq.com/x", "https://meet.example.net/abc", "https://ashbyhq.com.example.net/x", "https://user:pw@app.ashbyhq.com/x", "not a url"]) expect(ashbyUrl(url)).toBeUndefined()
  })

  test("takes the structured output, or the text as JSON, or the text itself", () => {
    expect(resultData({ output: { interviews: [] } })).toEqual({ interviews: [] })
    expect(resultData({ content: [{ type: "text", text: '{"interviews":[1]}' }] })).toEqual({ interviews: [1] })
    expect(resultData({ content: [{ type: "text", text: "<Interviews />" }] })).toBe("<Interviews />")
  })
})

describe("events_list", () => {
  const fixtures = { source: SOURCE, account: ACCOUNT, owner: OWNER, since: SINCE, expected: EXPECTED, binding: { plugin: "ashby" }, codes: true, maxBytes: MAX_BYTES, kinds: ["meeting"], namespace: "ashby", refused: [SECRET] }

  test("keeps the events_list contract, with the bound cursor, the table's codes and the secret refused", async () => {
    await assertEventsListConformance(list(), { ...fixtures, pageSize: 2 })
  })

  test("keeps it with the source named and pages of one", async () => {
    await assertEventsListConformance(list(), { ...fixtures, sourceInput: true, pageSize: 1 })
  })

  test("pages: two at a time, then on from the cursor, until more is false", async () => {
    const seen: string[] = []
    let page = (await list()({ since: SINCE, limit: 2 })) as EventsListResult
    seen.push(...page.events.map((event) => event.external_id))
    while (page.more) {
      page = (await list()({ account: ACCOUNT, cursor: page.cursor, limit: 2 })) as EventsListResult
      seen.push(...page.events.map((event) => event.external_id))
    }
    expect(seen).toEqual(EXPECTED)
    // Nothing new: an empty page that names its owner, whose cursor has moved to what it read, and stays there.
    const empty = (await list()({ account: ACCOUNT, cursor: page.cursor })) as EventsListResult
    expect(empty).toMatchObject({ events: [], more: false, owner: OWNER, source: SOURCE, account: ACCOUNT, trust: "untrusted" })
    expect((await list()({ account: ACCOUNT, cursor: empty.cursor })) as EventsListResult).toMatchObject({ events: [], more: false, cursor: empty.cursor })
  })

  test("makes each interview one event of metadata: the title and job, the candidate and interviewers by Ashby id, its link, and no text", async () => {
    const result = (await list()({ since: SINCE, limit: PAGE.max })) as EventsListResult
    expect(resultProblems(result, PAGE.max, MAX_BYTES)).toEqual([])
    const [first, second, , fourB] = result.events
    expect(first).toMatchObject({
      external_id: "ie-0001",
      kind: "meeting",
      occurred_at: "2026-10-01T09:00:00.000Z",
      title: "Hiring manager screen — Platform Engineer",
      text: "",
      thread: null,
      labels: [],
      url: "https://app.ashbyhq.com/interviews/ie-0001",
      actors: [
        { role: "candidate", id: "ashby:candidate:cand-0001", name: "Casey Sample" },
        { role: "interviewer", id: "ashby:user:user-0001", name: "Ada Example" },
      ],
    })
    // The start is read with its offset, and a link that is not Ashby's is never the url.
    expect(second).toMatchObject({ occurred_at: "2026-10-02T13:00:00.000Z", url: null })
    expect(fourB!.actors).toContainEqual({ role: "interviewer", id: "name:Hana%20Example", name: "Hana Example" })
    // The page's owner is the user's own sign-in; the events name no one by an address.
    const text = JSON.stringify(result.events)
    for (const absent of ["@example.test", "meet.example.net", "Ira Sample", "Jo Example", "Kai Sample"]) expect({ absent, found: text.includes(absent) }).toEqual({ absent, found: false })
  })

  test("refuses an interview whose title holds a secret for good, and moves the cursor past it", async () => {
    const result = (await list()({ since: SINCE, limit: PAGE.max })) as EventsListResult
    expect(result.refused).toEqual([{ external_id: SECRET, reason: "secret", detail: "holds a secret (connection string)" }])
    expect(JSON.stringify(result)).not.toContain("Hb3nQ8vTk2")
  })

  test("lists an interview once it started 30 minutes ago, and never one ahead", async () => {
    const at = Date.parse("2026-11-08T11:45:00Z")
    expect((await list(ashby(), at + SETTLE_MS - 1)({ since: "2026-11-08" })) as EventsListResult).toMatchObject({ events: [] })
    expect(((await list(ashby(), at + SETTLE_MS)({ since: "2026-11-08" })) as EventsListResult).events.map((event) => event.external_id)).toEqual(["ie-0007"])
  })

  test("reads list_interviews a week at a time, both bounds as UTC times, with the one reason and no other input", async () => {
    const fake = ashby()
    await list(fake)({ since: SINCE, limit: PAGE.max })
    expect(fake.calls[0]).toEqual({ onOrAfterDate: "2026-09-28T00:00:00.000Z", onOrBeforeDate: "2026-10-05T00:00:00.000Z", reason: LIST_REASON })
    for (const input of fake.calls) {
      expect(Object.keys(input).sort()).toEqual(["onOrAfterDate", "onOrBeforeDate", "reason"])
      expect(Date.parse(String(input["onOrBeforeDate"])) - Date.parse(String(input["onOrAfterDate"]))).toBeLessThanOrEqual(WINDOW_MS)
    }
    expect(LIST_REASON).not.toMatch(/@|candidate name/i)
  })

  test("an empty week is an empty page with a cursor that moves on, and an old cursor never expires: it reads on, a few months a call", async () => {
    const quiet = (await list()({ since: "2026-10-25T00:00:00Z" })) as EventsListResult
    expect(quiet).toMatchObject({ events: [], more: false })
    const t = Date.parse("2025-11-01T00:00:00Z")
    const old = encodeBoundCursor(BINDING, { o: (await ownerDigestOf()), t, i: "", f: t, d: "" })
    const fake = ashby()
    const page = (await list(fake)({ account: ACCOUNT, cursor: old })) as EventsListResult
    expect(page).toMatchObject({ events: [], more: true })
    expect(fake.calls).toHaveLength(MAX_WINDOWS)
    let next = page
    while (next.more) next = (await list()({ account: ACCOUNT, cursor: next.cursor })) as EventsListResult
    expect(next.more).toBe(false)
  })

  test("refuses another sign-in's cursor and another account with ACCOUNT_MISMATCH, before any read", async () => {
    const fake = ashby()
    const first = (await list()({ since: SINCE, limit: 1 })) as EventsListResult
    const other = { ...OWNER, id: "ashby:credential:cred-2" }
    expect(await code(list(fake, NOW, other)({ account: ACCOUNT, cursor: first.cursor }))).toBe("ACCOUNT_MISMATCH")
    expect(await code(list(fake)({ account: "work", since: SINCE }))).toBe("ACCOUNT_MISMATCH")
    expect(fake.calls).toEqual([])
  })

  test("refuses a cursor it did not issue, or one passed without its account, before any read", async () => {
    const fake = ashby()
    const first = (await list()({ since: SINCE, limit: 1 })) as EventsListResult
    expect(await code(list(fake)({ account: ACCOUNT, cursor: "not-a-cursor" }))).toBe("CURSOR_INVALID")
    expect(await code(list(fake)({ account: ACCOUNT, cursor: encodeBoundCursor({ ...BINDING, plugin: "metaview" }, { o: "0123456789abcdef", t: 0, i: "", f: 0, d: "" }) }))).toBe("CURSOR_INVALID")
    // This source's binding, without the lookback it always carries.
    expect(await code(list(fake)({ account: ACCOUNT, cursor: encodeBoundCursor(BINDING, { o: "0123456789abcdef", t: 0, i: "" }) }))).toBe("CURSOR_INVALID")
    expect(await code(list(fake)({ cursor: first.cursor }))).toBe("INPUT_INVALID")
    expect(fake.calls).toEqual([])
  })

  test("refuses another source, a malformed input, a scope, and a listing with no sign-in", async () => {
    expect(await code(list()({ source: "candidates" }))).toBe("SOURCE_UNKNOWN")
    expect(await code(list()({ limit: 0 }))).toBe("INPUT_INVALID")
    expect(await code(list()({ scope: { jobs: ["x"] } }))).toBe("INPUT_INVALID")
    expect(await code(listEvents(ashby().list, undefined, { since: SINCE }, NOW))).toBe("NEEDS_SIGN_IN")
  })

  test("stops with UNAVAILABLE when Ashby answers in a form it does not read, rather than report an empty week", async () => {
    expect(await code(list(ashby(FIXTURE.interviews, () => ({ message: "Here are your interviews" })))({ since: SINCE }))).toBe("UNAVAILABLE")
    expect(await code(list(ashby(FIXTURE.interviews, (found) => found.map((interview) => ({ ...interview, startTime: "Oct 1" }))))({ since: SINCE }))).toBe("UNAVAILABLE")
  })

  test("a page where one entry cannot be read answers UNAVAILABLE, lists nothing, and its cursor holds", async () => {
    const broken = { interviewEventId: "ie-broken", interviewTitle: "Unscheduled", scheduledAt: "2026-10-03T10:00:00Z" }
    const first = (await list()({ since: SINCE, limit: 1 })) as EventsListResult
    const mixed = ashby(FIXTURE.interviews, (found) => ({ interviews: [...found, broken] }))
    const failure = (await list(mixed)({ account: ACCOUNT, cursor: first.cursor }).catch((error) => error)) as EventsFailure
    expect(failure).toBeInstanceOf(EventsFailure)
    expect(failure.code).toBe("UNAVAILABLE")
    expect(failure.message).toContain("1 of ")
    // The same cursor reads on once Ashby's answer is whole again: nothing was skipped.
    const next = (await list()({ account: ACCOUNT, cursor: first.cursor, limit: 1 })) as EventsListResult
    expect(next.events.map((event) => event.external_id)).toEqual([EXPECTED[1]])
  })

  test("a week Ashby cuts short is read again in halves, so every interview is listed and none is lost", async () => {
    const cap = 2
    const fake = ashby(FIXTURE.interviews, (found) => ({ interviews: found.slice(0, cap), hasMore: found.length > cap }))
    const result = (await list(fake)({ since: SINCE, limit: PAGE.max })) as EventsListResult
    expect(result.events.map((event) => event.external_id)).toEqual(EXPECTED)
    expect(fake.calls.length).toBeGreaterThan(Math.ceil((NOW - Date.parse(SINCE)) / WINDOW_MS))
    for (const input of fake.calls) expect(Date.parse(String(input["onOrBeforeDate"])) - Date.parse(String(input["onOrAfterDate"]))).toBeGreaterThanOrEqual(MIN_WINDOW_MS - 1000)
  })

  test("an hour Ashby still cuts short is UNAVAILABLE; a page out of calls stops before the window, with more and its cursor held", async () => {
    expect(await code(list(ashby(FIXTURE.interviews, (found) => ({ interviews: found, truncated: true })))({ since: SINCE }))).toBe("UNAVAILABLE")
    // Each week's first answer is cut short, its halves whole: a page runs out of calls part way, and says there is more.
    const seen = new Set<string>()
    const fake = ashby(FIXTURE.interviews, (found) => ({ interviews: found }))
    const halving = async (input: Record<string, unknown>) => {
      const span = Date.parse(String(input["onOrBeforeDate"])) - Date.parse(String(input["onOrAfterDate"]))
      const answer = (await fake.list(input)) as { interviews: unknown[] }
      return span >= WINDOW_MS ? { ...answer, hasMore: true } : answer
    }
    let page = (await listEvents(halving, OWNER, { since: "2025-11-01T00:00:00Z", limit: PAGE.max }, NOW)) as EventsListResult
    expect(page.more).toBe(true)
    expect(fake.calls.length).toBeLessThanOrEqual(MAX_CALLS)
    for (let guard = 0; guard < 40; guard++) {
      for (const event of page.events) seen.add(event.external_id)
      if (!page.more) break
      fake.calls.length = 0
      page = (await listEvents(halving, OWNER, { account: ACCOUNT, cursor: page.cursor, limit: PAGE.max }, NOW)) as EventsListResult
      expect(fake.calls.length).toBeLessThanOrEqual(MAX_CALLS)
    }
    expect([...seen]).toEqual(EXPECTED)
  })

  test("an interview that becomes visible late, behind the cursor and inside the lookback, is listed exactly once", async () => {
    const day = 86_400_000
    const db: Record<string, unknown>[] = [{ interviewEventId: "a", interviewTitle: "Screen", startTime: "2026-11-05T10:00:00Z" }]
    const fake = ashby(db)
    const read = (input: unknown, at: number) => listEvents(fake.list, OWNER, input, at)
    const first = await read({ since: "2026-11-01" }, NOW)
    expect(first.events.map((event) => event.external_id)).toEqual(["a"])
    // Logged two days after it happened, behind the last listed start, and one in the stretch the cursor already passed.
    db.push({ interviewEventId: "late-behind", interviewTitle: "Debrief", startTime: "2026-11-04T09:00:00Z" })
    db.push({ interviewEventId: "late-stretch", interviewTitle: "Pairing", startTime: "2026-11-07T09:00:00Z" })
    const second = await read({ account: ACCOUNT, cursor: first.cursor }, NOW + 3_600_000)
    expect(second.events.map((event) => event.external_id)).toEqual(["late-behind", "late-stretch"])
    // Read again and again: nothing is listed twice, and something new is still listed after them.
    const third = await read({ account: ACCOUNT, cursor: second.cursor }, NOW + 7_200_000)
    expect(third.events).toEqual([])
    db.push({ interviewEventId: "new", interviewTitle: "Final", startTime: "2026-11-08T10:00:00Z" })
    const fourth = await read({ account: ACCOUNT, cursor: third.cursor }, NOW + day)
    expect(fourth.events.map((event) => event.external_id)).toEqual(["new"])
    const fifth = await read({ account: ACCOUNT, cursor: fourth.cursor }, NOW + day + 3_600_000)
    expect(fifth.events).toEqual([])
    // One that becomes visible later than the lookback is not listed: the residue the README states.
    db.push({ interviewEventId: "too-late", interviewTitle: "Old", startTime: new Date(NOW + day - SETTLE_MS - LOOKBACK_MS - day).toISOString() })
    expect((await read({ account: ACCOUNT, cursor: fifth.cursor }, NOW + day + 7_200_000)).events).toEqual([])
  })

  test("the cursor remembers at most MAX_SEEN listed interviews, stays within the contract's cursor length, and still never lists one twice", async () => {
    const busy = Array.from({ length: 120 }, (_, index) => ({ interviewEventId: `busy-${String(index).padStart(3, "0")}`, interviewTitle: "Screen", startTime: new Date(Date.parse("2026-11-03T00:00:00Z") + index * 1_800_000).toISOString() }))
    const fake = ashby(busy)
    const seen: string[] = []
    let page = await listEvents(fake.list, OWNER, { since: "2026-11-02", limit: 7 }, NOW)
    for (let guard = 0; guard < 40; guard++) {
      seen.push(...page.events.map((event) => event.external_id))
      expect(page.cursor.length).toBeLessThanOrEqual(EVENT_LIMITS.cursor)
      const state = JSON.parse(Buffer.from(page.cursor, "base64url").toString("utf8")) as { d: string }
      expect(state.d.length / 11).toBeLessThanOrEqual(MAX_SEEN)
      if (!page.more) break
      page = await listEvents(fake.list, OWNER, { account: ACCOUNT, cursor: page.cursor, limit: 7 }, NOW)
    }
    expect(seen).toEqual(busy.map((interview) => interview.interviewEventId))
    expect((await listEvents(fake.list, OWNER, { account: ACCOUNT, cursor: page.cursor }, NOW)).events).toEqual([])
  })

  test("a week too dense for one page's calls is read across pages: every page moves on, within its calls, and none is lost", async () => {
    // Ashby answers at most one interview per call, so a week of 40 needs far more calls than one page has.
    const dense = Array.from({ length: 40 }, (_, index) => ({ interviewEventId: `d-${String(index).padStart(2, "0")}`, interviewTitle: "Screen", startTime: new Date(Date.parse("2026-11-02T00:00:00Z") + index * 3 * 3_600_000).toISOString() }))
    let calls = 0
    const capped = ashby(dense, (found) => ({ interviews: found.slice(0, 1), hasMore: found.length > 1 }))
    const counted = async (input: Record<string, unknown>) => ((calls += 1), capped.list(input))
    const listed: string[] = []
    let page = await listEvents(counted, OWNER, { since: "2026-11-01T23:00:00Z", limit: PAGE.max }, NOW)
    let positions = 0
    for (let guard = 0; guard < 60; guard++) {
      expect(calls).toBeLessThanOrEqual(MAX_CALLS)
      listed.push(...page.events.map((event) => event.external_id))
      if (!page.more) break
      const before = page.cursor
      calls = 0
      page = await listEvents(counted, OWNER, { account: ACCOUNT, cursor: before, limit: PAGE.max }, NOW)
      expect(page.cursor).not.toBe(before)
      positions++
    }
    expect(positions).toBeGreaterThan(1)
    expect(listed).toEqual(dense.map((interview) => interview.interviewEventId))
    expect(LOOKBACK_CALLS).toBeLessThan(MAX_CALLS - 9)
  })

  test("is allowed by the default rules, and so is probe, at every access", () => {
    for (const access of ["all", "ask-changes", "read-only"] as const) {
      for (const action of [EVENTS_ACTION, PROBE_ACTION]) expect(evaluate([{ action: "*", resource: "*", effect: "allow" }, ...defaultRules(access)], action)).toBe("allow")
    }
    expect(EVENTS_INPUT.properties.cursor.maxLength).toBeLessThanOrEqual(EVENT_LIMITS.cursor)
    expect([EVENTS_INPUT.properties.limit.minimum, EVENTS_INPUT.properties.limit.maximum]).toEqual([PAGE.min, PAGE.max])
  })
})

/** The owner digest a cursor holds, read back from a cursor the source issued. */
async function ownerDigestOf(): Promise<string> {
  const first = (await list()({ since: SINCE, limit: 1 })) as EventsListResult
  const state = JSON.parse(Buffer.from(first.cursor, "base64url").toString("utf8")) as Record<string, unknown>
  const digest = state["o"]
  if (typeof digest !== "string") throw new Error(`the cursor holds no owner digest: ${JSON.stringify(state)}`)
  return digest
}

/** A plugin context with OpenCode's sign-in for ashby and its list_interviews executor. */
function context(options: { label?: string; list?: (input: Record<string, unknown>) => Promise<unknown>; tools?: boolean; status?: string; fail?: unknown } = {}) {
  const asserted: Record<string, unknown>[] = []
  const lister = options.list ?? ashby().list
  const ctx = {
    tool: {
      list: async () =>
        options.tools === false
          ? []
          : [
              {
                id: `ashby_${LIST_TOOL}`,
                execute: async (input: Record<string, unknown>) => {
                  if (options.fail !== undefined) throw options.fail
                  return { output: await lister(input) }
                },
              },
            ],
    },
    mcp: { list: async () => ({ data: [{ name: "ashby", integrationID: "int-1", status: { status: options.status ?? "connected" } }] }) },
    permission: { assert: async (request: Record<string, unknown>) => void asserted.push(request), hook: async () => ({ dispose: async () => undefined }) },
    integration: { connection: { active: async () => ({ type: "credential", id: "cred-1", label: options.label ?? "ada@example.test" }) } },
  }
  return { ctx: ctx as unknown as EventsContext, asserted }
}

const toolError = (message: string) => ({ _tag: "Tool.Error", message, error: undefined })

describe("Ashby's failures", () => {
  const run = (options: Parameters<typeof context>[0]) => eventsMethod(context(options).ctx, () => true, () => NOW).run({ since: SINCE }, { sessionID: "ses_1", agent: "build", messageID: "msg_1", id: "call_1", signal: new AbortController().signal, progress: async () => {} })

  test("Ashby's own error is UNAVAILABLE with its first line redacted, and its rate limit RATE_LIMITED", async () => {
    const failure = (await run({ fail: toolError("Internal error token=abcdef0123456789\nstack") }).catch((error) => error)) as EventsFailure
    expect(failure.code).toBe("UNAVAILABLE")
    expect(failure.message).not.toContain("abcdef0123456789")
    expect(failure.message).not.toContain("stack")
    expect(await code(run({ fail: toolError("Rate limit exceeded: 120 requests per minute") }))).toBe("RATE_LIMITED")
    expect(await code(run({ fail: toolError('MCP server "ashby" is not connected') }))).toBe("UNAVAILABLE")
  })

  test("a missing tool names the server's state: a needed sign-in is NEEDS_SIGN_IN, anything else UNAVAILABLE", async () => {
    expect(await code(run({ tools: false, status: "needs_auth" }))).toBe("NEEDS_SIGN_IN")
    expect(await code(run({ tools: false, status: "failed" }))).toBe("UNAVAILABLE")
    expect(await code(run({ tools: false }))).toBe("UNAVAILABLE")
  })

  test("a permission refusal passes through unchanged", async () => {
    const refusal = { _tag: "Tool.Error", message: "denied", error: new Error("the rule denied ashby_list_interviews") }
    expect(await run({ fail: refusal }).catch((error) => error)).toBe(refusal)
  })
})

describe("the owner", () => {
  test("is always the sign-in's credential id, with its label for display only, and never carries verified yet", async () => {
    expect(await signedIn(context().ctx)).toEqual(OWNER)
    expect(await signedIn(context({ label: "" }).ctx)).toEqual({ id: "ashby:credential:cred-1", label: "Ashby sign-in" })
    const none = { mcp: { list: async () => ({ data: [{ name: "ashby", status: { status: "connected" } }] }) }, integration: { connection: { active: async () => undefined } } }
    expect(await signedIn(none as never)).toBeUndefined()
  })
})

describe("probe", () => {
  test("names OpenCode's sign-in as the owner every page names, and reads nothing", async () => {
    const page = (await list()({ since: SINCE, limit: 1 })) as EventsListResult
    const result = ashbyProbe(OWNER, {})
    expect(probeResultProblems(result, { source: SOURCE, account: ACCOUNT })).toEqual([])
    expect(result).toEqual({ source: SOURCE, account: ACCOUNT, owner: page.owner, trust: "untrusted" })
  })

  test("refuses another account, another source, a malformed input and no sign-in", async () => {
    expect(await code(Promise.resolve().then(() => ashbyProbe(OWNER, { account: "work" })))).toBe("ACCOUNT_MISMATCH")
    expect(await code(Promise.resolve().then(() => ashbyProbe(OWNER, { source: "candidates" })))).toBe("SOURCE_UNKNOWN")
    expect(await code(Promise.resolve().then(() => ashbyProbe(OWNER, { since: SINCE })))).toBe("INPUT_INVALID")
    expect(await code(Promise.resolve().then(() => ashbyProbe(undefined, {})))).toBe("NEEDS_SIGN_IN")
  })
})

describe("the tools RPC's events_list and probe", () => {
  async function rpc(managed = true) {
    const { ctx, asserted } = context()
    let handlers: Record<string, (input: unknown, context: unknown) => Promise<unknown>> = {}
    const host = {
      ...ctx,
      location: { directory: "/fixture/project" },
      rpc: { register: async (_contract: unknown, registered: typeof handlers) => ((handlers = registered), { dispose: async () => undefined }) },
      session: { get: async ({ sessionID }: { sessionID: string }) => ({ id: sessionID, agent: "build", location: { directory: "/fixture/project" } }) },
      agent: { get: async () => ({ data: { permissions: [{ action: "*", resource: "*", effect: "allow" }, ...defaultRules("read-only")] } }) },
    }
    await registerToolsRpc(host as never, { plugin: PLUGIN, methods: [eventsMethod(ctx, () => managed, () => NOW), probeMethod(ctx, () => managed)], mcp: { server: "ashby", managed: () => managed } })
    const rpcContext = { signal: new AbortController().signal, error: (type: string, message: string, data?: unknown) => ({ type, message, data }) }
    return {
      asserted,
      run: (input: unknown) => handlers["events_list"]!({ sessionID: "ses_1", input }, rpcContext),
      probe: (input: unknown) => handlers["probe"]!({ sessionID: "ses_1", input }, rpcContext),
    }
  }

  test("asserts ashby_events_list, reads through list_interviews and keeps the contract, under read-only too", async () => {
    const { run, asserted } = await rpc()
    const list = async (input: unknown) => {
      const result = (await run(input)) as Record<string, unknown>
      if (result["type"] === "failed") throw new Error(String(result["message"]))
      return result
    }
    await assertEventsListConformance(list, { source: SOURCE, account: ACCOUNT, owner: OWNER, since: SINCE, expected: EXPECTED, refused: [SECRET], binding: { plugin: "ashby" }, codes: true, maxBytes: MAX_BYTES })
    expect(asserted.every((request) => request["action"] === EVENTS_ACTION)).toBe(true)
  })

  test("probe asserts ashby_probe alone and answers the sign-in", async () => {
    const { probe, asserted } = await rpc()
    expect(await probe({})).toEqual({ source: SOURCE, account: ACCOUNT, owner: OWNER, trust: "untrusted" })
    expect(asserted.map((request) => request["action"])).toEqual([PROBE_ACTION])
    expect(await probe({ account: "work" })).toMatchObject({ type: "failed", data: { code: "ACCOUNT_MISMATCH" } })
    expect(await (await rpc(false)).probe({})).toMatchObject({ type: "failed", data: { code: "UNAVAILABLE" } })
  })

  test("gives a script its code and next step, and refuses beside someone else's ashby server", async () => {
    expect(await (await rpc()).run({ account: ACCOUNT, cursor: "not-a-cursor" })).toMatchObject({ type: "failed", data: { code: "CURSOR_INVALID", next: expect.stringContaining("since") } })
    expect(await (await rpc(false)).run({})).toMatchObject({ type: "failed", data: { code: "UNAVAILABLE" } })
  })
})

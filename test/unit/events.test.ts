/**
 * The interviews source: the recorded envelope, metadata-only events, the settle window, the 7-day windows and their
 * 13-window cap, the 7-day lookback with its seen list, and a page that is read whole or not at all.
 */

import { encodeBoundCursor } from "@we-the-rebel-alliance/plugin-contract/cursor"
import { eventHash, resultProblems, type SourceEvent } from "@we-the-rebel-alliance/plugin-contract/events"
import { describe, expect, test } from "vitest"
import { packageName } from "../../src/manifest.ts"
import { MAX_SEEN, MAX_WINDOWS, SETTLE_MS, WINDOW_MS } from "../../src/provider/interviews.ts"
import { type CallAnswer, type Harness, type InterviewRecord, startHarness } from "../support/harness.ts"

const NOW = Date.parse("2026-11-20T12:00:00.000Z")
const SINCE = "2026-11-17T00:00:00Z"

const record = (id: string, startTime: string, extra: Partial<InterviewRecord> = {}): InterviewRecord => ({
  interviewEventId: id,
  interviewTitle: "Interview",
  startTime,
  ...extra,
})

const page = (answer: CallAnswer): Record<string, unknown> => {
  if (!answer.ok) throw new Error(`expected a page, got ${answer.code}: ${answer.message}`)
  return answer.output as Record<string, unknown>
}

const refused = (answer: CallAnswer): { code: string; message: string } => {
  if (answer.ok) throw new Error("expected a refusal, got a page")
  return { code: answer.code, message: answer.message }
}

const ids = (answer: CallAnswer): string[] => (page(answer)["events"] as { external_id: string }[]).map((event) => event.external_id)
const listIds = (answer: Record<string, unknown>): string[] => (answer["events"] as { external_id: string }[]).map((event) => event.external_id)

const two = (interviews: readonly InterviewRecord[], now = NOW, extra: { work?: Record<string, unknown>; personal?: InterviewRecord[] } = {}) =>
  startHarness({
    accounts: { work: { interviews, ...(extra.work ?? {}) }, personal: { interviews: extra.personal ?? [record("p-1", "2026-11-18T10:00:00.000Z")] } },
    now,
  })

const read = (harness: Harness, input: Record<string, unknown>) => harness.callTool("events_list", { account: "work", ...input })

describe("events_list", () => {
  test("lists a page oldest first, with the owner, the package, asOf and a cursor, and passes the contract's page checks", async () => {
    const harness = await two([
      record("iv-2", "2026-11-19T09:00:00.000Z"),
      record("iv-1", "2026-11-18T10:00:00.000Z"),
      record("iv-0", "2026-11-17T12:00:00.000Z"),
    ])
    try {
      const answer = page(await read(harness, { since: SINCE }))
      expect(resultProblems(answer, 100, 65_536)).toEqual([])
      expect(ids(await read(harness, { since: SINCE }))).toEqual(["iv-0", "iv-1", "iv-2"])
      expect(answer).toMatchObject({
        source: "ashby",
        account: "work",
        owner: { id: "ashby:credential:cred-work", label: "Ashby (work)", verified: false },
        trust: "untrusted",
        more: false,
        plugin: packageName,
        asOf: "2026-11-20T12:00:00.000Z",
      })
      for (const event of answer["events"] as SourceEvent[]) {
        const { hash, ...rest } = event
        expect(eventHash(rest)).toBe(hash)
        expect(event.kind).toBe("meeting")
        expect(event.text).toBe("")
      }
      expect(typeof answer["cursor"]).toBe("string")
    } finally {
      await harness.dispose()
    }
  })

  test("carries metadata only: no contact details, feedback, transcript or meeting link, and masks a title that has one", async () => {
    const harness = await two([
      record("iv-1", "2026-11-18T10:00:00.000Z", {
        interviewTitle: "Screen with ana@example.test",
        jobTitle: "Call +1 (415) 555-0100",
        candidate: { id: "cand-1", name: "Casey Example", email: "casey@example.test", phone: "+1 415 555 0100" },
        interviewers: [{ id: "user-1", name: "Ada Example", email: "ada@example.test" }],
        feedback: "a strong hire",
        transcript: "a transcript that must never be copied",
        url: "https://app.ashbyhq.com/interviews/iv-1?token=SECRET-1&utm_source=mail#top",
      }),
    ])
    try {
      const answer = page(await read(harness, { since: SINCE }))
      const [event] = answer["events"] as {
        title: string
        url: string
        text: string
        actors: { role: string; id: string; name: string }[]
      }[]
      expect(event).toMatchObject({
        title: "Screen with [email] — Call [phone]",
        url: "https://app.ashbyhq.com/interviews/iv-1",
        text: "",
        actors: [
          { role: "candidate", id: "ashby:candidate:cand-1", name: "Casey Example" },
          { role: "interviewer", id: "ashby:user:user-1", name: "Ada Example" },
        ],
      })
      const text = JSON.stringify(answer)
      for (const absent of [
        "ana@example.test",
        "casey@example.test",
        "ada@example.test",
        "415",
        "555-0100",
        "a strong hire",
        "a transcript",
        "SECRET-1",
        "utm_source",
      ]) {
        expect({ absent, found: text.includes(absent) }).toEqual({ absent, found: false })
      }
    } finally {
      await harness.dispose()
    }
  })

  test("lists an interview only once it started 30 minutes ago, and never a cancelled one", async () => {
    const at = new Date(NOW - 29 * 60_000).toISOString()
    const settled = new Date(NOW - SETTLE_MS).toISOString()
    const harness = await two([record("too-recent", at), record("settled", settled), record("cancelled", "2026-11-18T10:00:00.000Z", { status: "Cancelled" })])
    try {
      expect(ids(await read(harness, { since: SINCE }))).toEqual(["settled"])
    } finally {
      await harness.dispose()
    }
  })

  test("pages with limit and the cursor, oldest first and without repeats", async () => {
    const harness = await two([record("a", "2026-11-17T12:00:00.000Z"), record("b", "2026-11-18T10:00:00.000Z"), record("c", "2026-11-19T09:00:00.000Z")])
    try {
      let answer = page(await read(harness, { since: SINCE, limit: 1 }))
      const seen = (answer["events"] as { external_id: string }[]).map((event) => event.external_id)
      expect(answer["more"]).toBe(true)
      for (let guard = 0; guard < 5 && answer["more"] === true; guard++) {
        answer = page(await read(harness, { cursor: answer["cursor"], limit: 1 }))
        seen.push(...(answer["events"] as { external_id: string }[]).map((event) => event.external_id))
      }
      expect(seen).toEqual(["a", "b", "c"])
      expect(answer["more"]).toBe(false)
      expect(page(await read(harness, { cursor: answer["cursor"] }))["events"]).toEqual([])
    } finally {
      await harness.dispose()
    }
  })

  test("orders by (start, id), so three interviews at the same start are neither skipped nor repeated", async () => {
    const at = "2026-11-18T10:00:00.000Z"
    // The provider's own order is neither the start order nor the id order; the cursor's total order decides.
    const harness = await two([record("same-3", at), record("same-1", at), record("same-2", at)])
    try {
      const first = page(await read(harness, { since: SINCE, limit: 1 }))
      expect(listIds(first)).toEqual(["same-1"])
      expect(first["more"]).toBe(true)
      const second = page(await read(harness, { cursor: first["cursor"], limit: 1 }))
      expect(listIds(second)).toEqual(["same-2"])
      expect(second["more"]).toBe(true)
      const third = page(await read(harness, { cursor: second["cursor"], limit: 1 }))
      expect(listIds(third)).toEqual(["same-3"])
      expect(third["more"]).toBe(false)
      const fourth = page(await read(harness, { cursor: third["cursor"] }))
      expect(fourth["events"]).toEqual([])
      const listed = [...listIds(first), ...listIds(second), ...listIds(third)]
      expect(listed).toEqual(["same-1", "same-2", "same-3"])
      expect(new Set(listed).size).toBe(3)
    } finally {
      await harness.dispose()
    }
  })

  test("the lookback does not duplicate or drop one at the cursor's own start", async () => {
    const at = "2026-11-18T10:00:00.000Z"
    const lives: InterviewRecord[] = [record("same-1", at)]
    const harness = await two(lives)
    try {
      const first = page(await read(harness, { since: SINCE, limit: 1 }))
      expect(listIds(first)).toEqual(["same-1"])
      // A late arrival at the exact same start, lexicographically before the position: the lookback lists it once.
      lives.push(record("same-0", at))
      const second = page(await read(harness, { cursor: first["cursor"], limit: 1 }))
      expect(listIds(second)).toEqual(["same-0"])
      const third = page(await read(harness, { cursor: second["cursor"], limit: 1 }))
      expect(third["events"]).toEqual([])
      // A late arrival at the same start, lexicographically after the position, is still after the cursor's pair.
      lives.push(record("same-2", at))
      const fourth = page(await read(harness, { cursor: third["cursor"], limit: 1 }))
      expect(listIds(fourth)).toEqual(["same-2"])
      const fifth = page(await read(harness, { cursor: fourth["cursor"] }))
      expect(fifth["events"]).toEqual([])
    } finally {
      await harness.dispose()
    }
  })

  test("starts 24 hours back without since, and at since when it is given", async () => {
    const harness = await two([record("recent", "2026-11-20T10:00:00.000Z"), record("old", "2026-11-19T11:00:00.000Z")])
    try {
      expect(ids(await read(harness, {}))).toEqual(["recent"])
      expect(ids(await read(harness, { since: "2026-11-19T00:00:00Z" }))).toEqual(["old", "recent"])
    } finally {
      await harness.dispose()
    }
  })

  test("refuses a cursor from another account, another plugin or a malformed state, before any read", async () => {
    const harness = await two([record("a", "2026-11-18T10:00:00.000Z")])
    try {
      const work = page(await read(harness, { since: SINCE }))
      const before = harness.calls.length
      expect(refused(await harness.callTool("events_list", { account: "personal", cursor: work["cursor"] })).code).toBe("CURSOR_INVALID")
      expect(refused(await read(harness, { cursor: "not-a-cursor" })).code).toBe("CURSOR_INVALID")
      const foreign = encodeBoundCursor({ plugin: "another", source: "ashby", account: "work" }, { o: "0123456789abcdef", t: 0, i: "", f: 0, d: "" })
      expect(refused(await read(harness, { cursor: foreign })).code).toBe("CURSOR_INVALID")
      const bare = encodeBoundCursor({ plugin: "ashby", source: "ashby", account: "work" }, { o: "0123456789abcdef", t: 0, i: "" })
      expect(refused(await read(harness, { cursor: bare })).code).toBe("CURSOR_INVALID")
      expect(harness.calls.length).toBe(before)
    } finally {
      await harness.dispose()
    }
  })

  test("refuses a cursor issued for another sign-in with ACCOUNT_MISMATCH", async () => {
    const first = await two([record("a", "2026-11-18T10:00:00.000Z")])
    try {
      const cursor = page(await read(first, { since: SINCE }))["cursor"]
      const second = await startHarness({
        accounts: { work: { interviews: [record("a", "2026-11-18T10:00:00.000Z")], credential: { id: "cred-other", label: "Other" } }, personal: {} },
        now: NOW,
      })
      try {
        const answer = refused(await second.callTool("events_list", { account: "work", cursor }))
        expect(answer.code).toBe("ACCOUNT_MISMATCH")
        expect(answer.message).toContain("Next step: ")
        expect(second.calls).toEqual([])
      } finally {
        await second.dispose()
      }
    } finally {
      await first.dispose()
    }
  })

  test("lists an interview that became visible late inside the lookback exactly once, and never one older than it", async () => {
    const lives: InterviewRecord[] = [record("a", "2026-11-18T10:00:00.000Z")]
    const harness = await two(lives)
    try {
      const first = page(await read(harness, { since: SINCE }))
      expect((first["events"] as { external_id: string }[]).map((event) => event.external_id)).toEqual(["a"])
      lives.push(record("late-behind", "2026-11-17T09:00:00.000Z"))
      lives.push(record("late-stretch", "2026-11-19T09:00:00.000Z"))
      const second = page(await read(harness, { cursor: first["cursor"] }))
      expect((second["events"] as { external_id: string }[]).map((event) => event.external_id)).toEqual(["late-behind", "late-stretch"])
      const third = page(await read(harness, { cursor: second["cursor"] }))
      expect(third["events"]).toEqual([])
      lives.push(record("new", "2026-11-20T10:00:00.000Z"))
      const fourth = page(await read(harness, { cursor: third["cursor"] }))
      expect((fourth["events"] as { external_id: string }[]).map((event) => event.external_id)).toEqual(["new"])
      // One that becomes visible later than the lookback is not listed: the residue the docs state.
      const tooOld = new Date(NOW - 7 * 86_400_000 - 3_600_000).toISOString()
      lives.push(record("too-old", tooOld))
      const fifth = page(await read(harness, { cursor: fourth["cursor"] }))
      expect(fifth["events"]).toEqual([])
    } finally {
      await harness.dispose()
    }
  })

  test("reads 13 weeks at most from a long since, and says there is more", async () => {
    const harness = await two([record("recent", "2026-11-20T10:00:00.000Z")])
    try {
      const answer = page(await read(harness, { since: "2026-08-01T00:00:00Z" }))
      expect(answer["more"]).toBe(true)
      expect(harness.callsOf("work")).toHaveLength(MAX_WINDOWS)
      for (const call of harness.callsOf("work")) {
        const from = Date.parse(String(call.input["onOrAfterDate"]))
        const to = Date.parse(String(call.input["onOrBeforeDate"]))
        expect(to - from).toBeLessThanOrEqual(WINDOW_MS)
      }
    } finally {
      await harness.dispose()
    }
  })

  test("reads a week Ashby cuts short again in halves, so no interview is dropped", async () => {
    const harness = await two(
      [record("a", "2026-11-17T12:00:00.000Z"), record("b", "2026-11-18T10:00:00.000Z"), record("c", "2026-11-19T09:00:00.000Z")],
      NOW,
      { work: { cap: 1 } },
    )
    try {
      expect(ids(await read(harness, { since: SINCE }))).toEqual(["a", "b", "c"])
      expect(harness.callsOf("work").length).toBeGreaterThan(1)
    } finally {
      await harness.dispose()
    }
  })

  test("a window Ashby still cuts short at one hour is UNAVAILABLE, never a shorter week", async () => {
    const harness = await two([record("a", "2026-11-18T10:00:00.000Z")], NOW, { work: { cap: 0 } })
    try {
      const answer = refused(await read(harness, { since: "2026-11-18T00:00:00Z" }))
      expect(answer.code).toBe("UNAVAILABLE")
      expect(answer.message).toContain("one hour")
      expect(answer.message).toContain("Next step: ")
    } finally {
      await harness.dispose()
    }
  })

  test("an answer it cannot read whole is UNAVAILABLE, and nothing of the page is listed", async () => {
    for (const answer of [
      () => ({ message: "Here are your interviews" }),
      () => ({ data: { interviews: [{ interviewEventId: "x" }], returnedCount: 1 } }),
      () => ({ data: { interviews: [], returnedCount: 2 } }),
      () => ({ data: { interviews: [record("ok", "2026-11-18T10:00:00.000Z"), { interviewEventId: "bad" }], returnedCount: 2 } }),
    ]) {
      const harness = await two([record("real", "2026-11-18T10:00:00.000Z")], NOW, { work: { answer } })
      try {
        const refusedAnswer = refused(await read(harness, { since: SINCE }))
        expect(refusedAnswer.code).toBe("UNAVAILABLE")
        expect(refusedAnswer.message).toContain("Next step: ")
      } finally {
        await harness.dispose()
      }
    }
  })

  test("refuses an interview whose title holds a secret for good, and moves the cursor past it", async () => {
    // Built at runtime: the committed file carries no credential-shaped literal, and every part is invented.
    const scheme = ["ft", "p"].join("")
    const userinfo = ["ops", "Hb3nQ8vTk2"].join(":")
    const invented = `${scheme}://${userinfo}@${["files", "example.org", "debrief"].join(".")}`
    const harness = await two([
      record("secret", "2026-11-17T12:00:00.000Z", { interviewTitle: `Debrief at ${invented}` }),
      record("clean", "2026-11-18T10:00:00.000Z"),
    ])
    try {
      const answer = page(await read(harness, { since: SINCE }))
      expect(ids(await read(harness, { since: SINCE }))).toEqual(["clean"])
      expect(answer["refused"]).toEqual([{ external_id: "secret", reason: "secret", detail: "holds a secret (connection string)" }])
      expect(JSON.stringify(answer)).not.toContain("Hb3nQ8vTk2")
      const next = page(await read(harness, { cursor: answer["cursor"] }))
      expect(next["events"]).toEqual([])
      expect(next["refused"]).toBeUndefined()
    } finally {
      await harness.dispose()
    }
  })

  test("keeps the cursor within 1024 characters while it remembers at most 40 listed interviews", async () => {
    const busy = Array.from({ length: 60 }, (_, index) =>
      record(`busy-${String(index).padStart(2, "0")}`, new Date(Date.parse("2026-11-18T00:00:00.000Z") + index * 1_800_000).toISOString()),
    )
    const harness = await two(busy)
    try {
      let answer = page(await read(harness, { since: SINCE, limit: 7 }))
      const seen: string[] = []
      for (let guard = 0; guard < 20; guard++) {
        seen.push(...(answer["events"] as { external_id: string }[]).map((event) => event.external_id))
        expect((answer["cursor"] as string).length).toBeLessThanOrEqual(1024)
        const state = JSON.parse(Buffer.from(answer["cursor"] as string, "base64url").toString("utf8")) as { d: string }
        expect(state.d.length / 11).toBeLessThanOrEqual(MAX_SEEN)
        if (answer["more"] !== true) break
        answer = page(await read(harness, { cursor: answer["cursor"], limit: 7 }))
      }
      expect(seen).toEqual(busy.map((interview) => interview.interviewEventId))
      expect(new Set(seen).size).toBe(seen.length)
    } finally {
      await harness.dispose()
    }
  })

  test("an empty window is an empty page with a cursor that moves on", async () => {
    const harness = await two([record("a", "2026-11-20T10:00:00.000Z")])
    try {
      const quiet = page(await read(harness, { since: "2026-10-25T00:00:00Z", limit: 100 }))
      expect((quiet["events"] as { external_id: string }[]).map((event) => event.external_id)).toEqual(["a"])
      const next = page(await read(harness, { cursor: quiet["cursor"] }))
      expect(next["events"]).toEqual([])
      expect(next["more"]).toBe(false)
      const again = page(await read(harness, { cursor: next["cursor"] }))
      expect(again["events"]).toEqual([])
    } finally {
      await harness.dispose()
    }
  })
})

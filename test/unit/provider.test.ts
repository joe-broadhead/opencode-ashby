/**
 * The provider client: the alias's own server and tool, fast refusals for a server that cannot answer, Ashby's own
 * `Tool.Error` mapped to one contract code on one redacted line, and the owner read from OpenCode's sign-in.
 */
import { describe, expect, test } from "vitest"
import { type CallAnswer, type HarnessAccount, type InterviewRecord, startHarness } from "../support/harness.ts"

const NOW = Date.parse("2026-11-20T12:00:00.000Z")
const SINCE = "2026-11-17T00:00:00Z"

const WORK: InterviewRecord[] = [
  { interviewEventId: "iv-1", interviewTitle: "Screen", startTime: "2026-11-18T10:00:00.000Z", candidate: { id: "cand-1", name: "Casey Example" } },
  { interviewEventId: "iv-2", interviewTitle: "Design", startTime: "2026-11-19T09:00:00.000Z" },
]

const output = (answer: CallAnswer): Record<string, unknown> => {
  if (!answer.ok) throw new Error(`expected a result, got ${answer.code}: ${answer.message}`)
  return answer.output as Record<string, unknown>
}

const refusal = (answer: CallAnswer): { code: string; message: string } => {
  if (answer.ok) throw new Error("expected a refusal, got a result")
  return { code: answer.code, message: answer.message }
}

/** One `default` account, whose server is `ashby`. */
const single = (account: HarnessAccount) =>
  startHarness({ accounts: { default: { interviews: WORK, ...account } }, options: { access: "all", accounts: {} }, now: NOW })

describe("the provider", () => {
  test("uses the alias's own server and its own list_interviews, and sends only the window and the one reason", async () => {
    const harness = await startHarness({ accounts: { work: { interviews: WORK }, personal: {} }, now: NOW })
    try {
      output(await harness.callTool("events_list", { account: "work", since: SINCE }))
      expect(harness.callsOf("work").length).toBeGreaterThan(0)
      expect(harness.callsOf("personal")).toEqual([])
      for (const call of harness.callsOf("work")) {
        expect(call.tool).toBe("list_interviews")
        expect(call.request).toMatch(/^req_ashby_\d{4}_list_interviews$/)
        expect(Object.keys(call.input).sort()).toEqual(["onOrAfterDate", "onOrBeforeDate", "reason"])
      }
      output(await harness.callTool("events_list", { account: "personal", since: SINCE }))
      expect(harness.callsOf("personal").length).toBeGreaterThan(0)
      expect(harness.callsOf("work").length).toBeGreaterThan(0)
    } finally {
      await harness.dispose()
    }
  })

  test("refuses when the connected server lists no list_interviews", async () => {
    const harness = await startHarness({ accounts: { work: { listTool: false, interviews: WORK }, personal: {} }, now: NOW })
    try {
      const answer = refusal(await harness.callTool("events_list", { account: "work", since: SINCE }))
      expect(answer.code).toBe("UNAVAILABLE")
      expect(answer.message).toContain("lists no list_interviews")
      expect(answer.message).toContain("Next step: ")
    } finally {
      await harness.dispose()
    }
  })

  test("refuses a server that cannot answer now, naming its state, and never waits on it", async () => {
    const cases: { account: HarnessAccount; code: string; text: string }[] = [
      { account: { status: "needs_auth" }, code: "NEEDS_SIGN_IN", text: "needs a sign-in" },
      { account: { status: "pending" }, code: "UNAVAILABLE", text: "still connecting" },
      { account: { status: "disabled" }, code: "UNAVAILABLE", text: "disabled" },
      { account: { status: "failed", reason: "Bad gateway?token=SECRET-9" }, code: "UNAVAILABLE", text: "could not connect" },
      { account: { status: "missing" }, code: "UNAVAILABLE", text: "not registered" },
    ]
    for (const item of cases) {
      const harness = await single(item.account)
      try {
        const answer = refusal(await harness.callTool("events_list", { since: SINCE }))
        expect({ status: item.account.status, code: answer.code }).toEqual({ status: item.account.status, code: item.code })
        expect(answer.message).toContain(item.text)
        expect(answer.message).toContain("Next step: ")
        expect(answer.message).not.toContain("SECRET-9")
        expect(harness.calls).toEqual([])
      } finally {
        await harness.dispose()
      }
    }
  })

  test("maps an MCP Tool.Error to PERMISSION_DENIED, RATE_LIMITED or UNAVAILABLE, on one redacted line", async () => {
    const rate = await single({ fail: "rate-limit" })
    try {
      const answer = refusal(await rate.callTool("events_list", { since: SINCE }))
      expect(answer.code).toBe("RATE_LIMITED")
      expect(answer.message).toMatch(/request req_ashby_\d{4}_list_interviews/)
      expect(answer.message).toContain("Next step: ")
    } finally {
      await rate.dispose()
    }
    const broken = await single({ fail: "unavailable" })
    try {
      const answer = refusal(await broken.callTool("events_list", { since: SINCE }))
      expect(answer.code).toBe("UNAVAILABLE")
      expect(answer.message).toContain("Ashby had an internal error")
      expect(answer.message).toContain("Next step: ")
    } finally {
      await broken.dispose()
    }
    const denied = await single({ fail: "permission" })
    try {
      const answer = refusal(await denied.callTool("events_list", { since: SINCE }))
      expect(answer.code).toBe("PERMISSION_DENIED")
      expect(answer.message).toContain("Permission denied")
      expect(answer.message).toContain("Next step: ")
    } finally {
      await denied.dispose()
    }
  })

  test("reads a JSON text answer, and reads an empty or missing answer as unknown, never zero", async () => {
    const text = await single({
      fail: "text",
      message: JSON.stringify({
        data: {
          interviews: [WORK[0]],
          returnedCount: 1,
          truncated: false,
          onOrAfterDate: "2026-11-17T00:00:00.000Z",
          onOrBeforeDate: "2026-11-21T00:00:00.000Z",
        },
      }),
    })
    try {
      const page = output(await text.callTool("events_list", { since: SINCE }))
      expect((page["events"] as { external_id: string }[]).map((event) => event.external_id)).toEqual(["iv-1"])
    } finally {
      await text.dispose()
    }
    for (const account of [{ fail: "empty" as const }, { fail: "text" as const, message: "" }]) {
      const harness = await single(account)
      try {
        const answer = refusal(await harness.callTool("events_list", { since: SINCE }))
        expect(answer.code).toBe("UNAVAILABLE")
        expect(answer.message).toContain("answered nothing")
      } finally {
        await harness.dispose()
      }
    }
  })

  test("reads the owner from OpenCode's sign-in for the alias's server, and calls Ashby for nothing", async () => {
    const harness = await startHarness({ accounts: { work: { interviews: WORK }, personal: {} }, now: NOW })
    try {
      const probe = output(await harness.callTool("probe", { account: "work" }))
      expect(probe).toEqual({
        source: "ashby",
        account: "work",
        owner: { id: "ashby:credential:cred-work", label: "Ashby (work)", verified: false },
        trust: "untrusted",
      })
      const personal = output(await harness.callTool("probe", { account: "personal" }))
      expect(personal["owner"]).toEqual({ id: "ashby:credential:cred-personal", label: "Ashby (personal)", verified: false })
      expect(harness.calls).toEqual([])
    } finally {
      await harness.dispose()
    }
  })

  test("encodes the credential id, falls back to a neutral label, and needs a sign-in when there is none", async () => {
    const encoded = await single({ credential: { id: "a/b c", label: "   " } })
    try {
      const probe = output(await encoded.callTool("probe", {}))
      expect(probe["owner"]).toEqual({ id: "ashby:credential:a%2Fb%20c", label: "Ashby sign-in", verified: false })
    } finally {
      await encoded.dispose()
    }
    for (const account of [{ credential: null }, { status: "needs_auth" as const }]) {
      const harness = await single(account)
      try {
        const answer = refusal(await harness.callTool("probe", {}))
        expect(answer.code).toBe("NEEDS_SIGN_IN")
        expect(answer.message).toContain("Next step: ")
      } finally {
        await harness.dispose()
      }
    }
    const missing = await single({ status: "missing" })
    try {
      const answer = refusal(await missing.callTool("probe", {}))
      expect(answer.code).toBe("UNAVAILABLE")
      expect(answer.message).toContain("not registered")
    } finally {
      await missing.dispose()
    }
  })

  test("refuses an unknown input key and an account on a method that takes none", async () => {
    const harness = await single({ interviews: WORK })
    try {
      expect(refusal(await harness.callTool("events_list", { since: SINCE, scope: { jobs: ["x"] } })).code).toBe("INPUT_INVALID")
      expect(refusal(await harness.callTool("status", { account: "default" })).code).toBe("INPUT_INVALID")
      expect(refusal(await harness.callTool("probe", { source: "candidates" })).code).toBe("SOURCE_UNKNOWN")
    } finally {
      await harness.dispose()
    }
  })
})

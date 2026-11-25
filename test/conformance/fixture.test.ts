/**
 * The conformance recording: the real handlers, provider and register, with a faithful fake of Ashby's MCP transport.
 *
 * Every answer in `fixtures/conformance.json` is produced here, for two synthetic aliases (`work` and `personal`), by
 * the same code OpenCode runs: the tool door validates the input, resolves the account, asserts the method's permission,
 * runs the handler, checks the output and maps a refusal. The fixture is regenerated deterministically and the test
 * fails on drift; `UPDATE_FIXTURES=1` writes it. Every person, job, id and link is invented.
 */
import { readFileSync, writeFileSync } from "node:fs"
import { probeResultProblems, resultProblems } from "@we-the-rebel-alliance/plugin-contract/events"
import { describe, expect, test } from "vitest"
import { packageName } from "../../src/manifest.ts"
import { type InterviewRecord, startHarness } from "../support/harness.ts"

const FILE = new URL("../../fixtures/conformance.json", import.meta.url)
const NOW = Date.parse("2026-11-20T12:00:00.000Z")
const SINCE = "2026-11-17T00:00:00Z"

/** Work's interviews: three listed (one with contact details to mask), one cancelled, one too recent to settle. */
const WORK: InterviewRecord[] = [
  {
    interviewEventId: "iv-1005",
    interviewTitle: "Screen with ana@example.test",
    jobTitle: "Call +1 (415) 555-0100",
    startTime: "2026-11-17T12:00:00.000Z",
    candidate: { id: "cand-1005", name: "Eli Example", email: "eli@example.test", phone: "+1 415 555 0100" },
    interviewers: [{ id: "user-1001", name: "Ada Example", email: "ada@example.test" }],
    feedback: "strong hire",
    transcript: "a transcript that must never reach an event",
  },
  {
    interviewEventId: "iv-1001",
    interviewTitle: "Hiring manager screen",
    jobTitle: "Platform Engineer",
    startTime: "2026-11-18T10:00:00.000Z",
    candidate: { id: "cand-1001", name: "Casey Example" },
    interviewers: [{ id: "user-1001", name: "Ada Example" }],
    url: "https://app.ashbyhq.com/interviews/iv-1001?token=SECRET-1&utm_source=mail#top",
  },
  {
    interviewEventId: "iv-1002",
    interviewTitle: "Systems design",
    jobTitle: "Platform Engineer",
    startTime: "2026-11-19T09:00:00.000Z",
    candidate: { id: "cand-1002", name: "Drew Sample" },
    interviewers: [
      { id: "user-1001", name: "Ada Example" },
      { id: "user-1002", name: "Bo Example" },
    ],
  },
  { interviewEventId: "iv-1003", interviewTitle: "Debrief", startTime: "2026-11-18T15:00:00.000Z", status: "Cancelled" },
  { interviewEventId: "iv-1004", interviewTitle: "Too recent", startTime: "2026-11-20T11:45:00.000Z" },
]

const PERSONAL: InterviewRecord[] = [
  {
    interviewEventId: "iv-2001",
    interviewTitle: "Values interview",
    jobTitle: "Data Analyst",
    startTime: "2026-11-18T15:00:00.000Z",
    candidate: { id: "cand-2001", name: "Frankie Example" },
    interviewers: [{ id: "user-2001", name: "Gus Sample" }],
  },
]

const page = (answer: { ok: true; output: unknown } | { ok: false; code: string; message: string }): Record<string, unknown> => {
  if (!answer.ok) throw new Error(`expected a page, got ${answer.code}: ${answer.message}`)
  return answer.output as Record<string, unknown>
}

const refusal = (answer: { ok: true } | { ok: false; code: string; message: string }): { code: string; message: string } => {
  if (answer.ok) throw new Error("expected a refusal, got a result")
  return { code: answer.code, message: answer.message }
}

describe("the conformance recording", () => {
  test("records two aliases, their pages, probe, status and no bus event, and matches the committed fixture", async () => {
    const harness = await startHarness({
      accounts: { work: { interviews: WORK }, personal: { interviews: PERSONAL } },
      now: NOW,
    })
    try {
      // The two account refusals, before any provider read.
      const required = refusal(await harness.callTool("events_list", {}))
      expect(required.code).toBe("ACCOUNT_REQUIRED")
      expect(required.message).toContain("Next step: ")
      expect(required.message).toContain("work")
      expect(required.message).toContain("personal")
      const unknown = refusal(await harness.callTool("events_list", { account: "nobodyhere" }))
      expect(unknown.code).toBe("ACCOUNT_UNKNOWN")
      expect(unknown.message).toContain("Next step: ")

      const status = page(await harness.callTool("status", {}))
      expect(status).toMatchObject({ name: "ashby", state: "ready", unguardedAgents: [], nextStep: null })

      // The full page, then the same read one event at a time, then nothing new.
      const full = page(await harness.callTool("events_list", { source: "ashby", account: "work", since: SINCE }))
      expect(resultProblems(full, 100, 65_536)).toEqual([])
      expect((full["events"] as { external_id: string }[]).map((event) => event.external_id)).toEqual(["iv-1005", "iv-1001", "iv-1002"])
      expect((full["events"] as { text: string }[]).every((event) => event.text === "")).toBe(true)
      expect((full["events"] as { title: string }[])[0]!.title).toBe("Screen with [email] — Call [phone]")
      expect((full["events"] as { url: string | null }[])[1]!.url).toBe("https://app.ashbyhq.com/interviews/iv-1001")
      const text = JSON.stringify(full)
      for (const absent of ["ana@example.test", "eli@example.test", "415", "555-0100", "strong hire", "a transcript", "SECRET-1", "utm_source"]) {
        expect({ absent, found: text.includes(absent) }).toEqual({ absent, found: false })
      }

      const one = page(await harness.callTool("events_list", { account: "work", since: SINCE, limit: 1 }))
      expect((one["events"] as { external_id: string }[]).map((event) => event.external_id)).toEqual(["iv-1005"])
      expect(one["more"]).toBe(true)
      const two = page(await harness.callTool("events_list", { account: "work", cursor: one["cursor"], limit: 1 }))
      expect((two["events"] as { external_id: string }[]).map((event) => event.external_id)).toEqual(["iv-1001"])
      expect(two["more"]).toBe(true)
      const three = page(await harness.callTool("events_list", { account: "work", cursor: two["cursor"], limit: 1 }))
      expect((three["events"] as { external_id: string }[]).map((event) => event.external_id)).toEqual(["iv-1002"])
      expect(three["more"]).toBe(false)
      const nothing = page(await harness.callTool("events_list", { account: "work", cursor: three["cursor"] }))
      expect(nothing["events"]).toEqual([])
      expect(nothing["more"]).toBe(false)

      // A cursor is bound to its account: work's third cursor under personal is foreign.
      const crossed = refusal(await harness.callTool("events_list", { account: "personal", cursor: three["cursor"] }))
      expect(crossed.code).toBe("CURSOR_INVALID")
      expect(crossed.message).toContain("Next step: ")

      const personal = page(await harness.callTool("events_list", { since: SINCE, account: "personal" }))
      expect((personal["events"] as { external_id: string }[]).map((event) => event.external_id)).toEqual(["iv-2001"])

      const probe = await harness.callTool("probe", { account: "work" })
      if (!probe.ok) throw new Error(`probe refused: ${probe.code}: ${probe.message}`)
      expect(probeResultProblems(probe.output, { source: "ashby", account: "work" })).toEqual([])
      expect(probe.output).toEqual({
        source: "ashby",
        account: "work",
        owner: { id: "ashby:credential:cred-work", label: "Ashby (work)", verified: false },
        trust: "untrusted",
      })

      // The plugin installs no per-request hook and emits no bus event: it makes no write of its own.
      expect(harness.skillIds).toEqual(["ashby", "ashby-write"])
      expect(harness.skillProblems).toEqual([])

      const expected = {
        $comment:
          "Recorded by test/conformance/fixture.test.ts through the plugin's real handlers, provider and register, over a fake Ashby MCP transport. Two mcp accounts (work and personal), one events source, its probe, and status. The plugin emits no bus event. Every person, job, id, link and message is invented.",
        plugin: packageName,
        accounts: {
          real: true,
          aliases: ["work", "personal"],
          required: { method: "events_list", code: "ACCOUNT_REQUIRED" },
          unknown: { method: "events_list", account: "nobodyhere", code: "ACCOUNT_UNKNOWN" },
          cursors: [{ method: "events_list", account: "work", other: "personal", code: "CURSOR_INVALID" }],
        },
        sources: {
          "ashby.interviews": {
            cases: [
              { name: "the work account from since", input: { source: "ashby", account: "work", since: SINCE }, expect: "page", answer: full },
              { name: "the first event of work, one at a time", input: { account: "work", since: SINCE, limit: 1 }, expect: "page", answer: one },
              { name: "the second, from its cursor", input: { account: "work", cursor: one["cursor"], limit: 1 }, expect: "page", answer: two },
              { name: "the third, from its cursor", input: { account: "work", cursor: two["cursor"], limit: 1 }, expect: "page", answer: three },
              { name: "nothing new from its cursor", input: { account: "work", cursor: three["cursor"] }, expect: "page", answer: nothing },
              { name: "the personal account from since", input: { account: "personal", since: SINCE }, expect: "page", answer: personal },
              {
                name: "work's cursor under the personal account",
                input: { account: "personal", cursor: three["cursor"] },
                expect: "CURSOR_INVALID",
                refuses: crossed.message,
              },
            ],
            probe: { input: { account: "work" }, answer: probe.output },
          },
        },
        events: { emitted: [], status },
        namespace: harness.manifest.plugin.summary,
      }

      const serialised = `${JSON.stringify(expected, null, 2)}\n`
      if (process.env["UPDATE_FIXTURES"] === "1") {
        writeFileSync(FILE, serialised)
        return
      }
      const committed = readFileSync(FILE, "utf8")
      expect(committed).toBe(serialised)
    } finally {
      await harness.dispose()
    }
  })
})

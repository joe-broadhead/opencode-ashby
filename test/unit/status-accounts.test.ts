/**
 * `status` and the account rules: one state per alias from the host's server record, an unreadable agent list as a
 * problem and never zero, `ACCOUNT_REQUIRED`/`ACCOUNT_UNKNOWN`, and `account` only where the manifest allows it.
 */
import { describe, expect, test } from "vitest"
import { type CallAnswer, type HarnessAccount, type InterviewRecord, startHarness } from "../support/harness.ts"

const NOW = Date.parse("2026-11-20T12:00:00.000Z")
const WORK: InterviewRecord[] = [{ interviewEventId: "iv-1", interviewTitle: "Screen", startTime: "2026-11-18T10:00:00.000Z" }]

const output = (answer: CallAnswer): Record<string, unknown> => {
  if (!answer.ok) throw new Error(`expected a result, got ${answer.code}: ${answer.message}`)
  return answer.output as Record<string, unknown>
}

const refusal = (answer: CallAnswer): { code: string; message: string } => {
  if (answer.ok) throw new Error("expected a refusal, got a result")
  return { code: answer.code, message: answer.message }
}

const single = (account: HarnessAccount = {}, options: Record<string, unknown> = { access: "all", accounts: {} }) =>
  startHarness({ accounts: { default: { interviews: WORK, ...account } }, options, now: NOW })

const status = async (harness: { callTool: (method: string, input: unknown) => Promise<CallAnswer> }) => output(await harness.callTool("status", {}))

const accountsOf = (answer: Record<string, unknown>) => answer["accounts"] as { alias: string; state: string; reason?: string; owner?: unknown }[]

describe("status", () => {
  test("is ready for a connected or connecting server, with no owner and no next step", async () => {
    for (const state of ["connected", "pending"] as const) {
      const harness = await single({ status: state })
      try {
        const answer = await status(harness)
        expect(Object.keys(answer).sort()).toEqual(["accounts", "host", "name", "nextStep", "state", "unguardedAgents", "version"])
        expect(answer).toMatchObject({
          name: "ashby",
          version: "0.0.9",
          host: { version: "2.4.1", range: ">=2.4.1 <2.5.0", tested: ["2.4.1"] },
          state: "ready",
          accounts: [{ alias: "default", state: "ready" }],
          unguardedAgents: [],
          nextStep: null,
        })
      } finally {
        await harness.dispose()
      }
    }
  })

  test("needs a sign-in for a server that needs auth, and says so once", async () => {
    const harness = await single({ status: "needs_auth" })
    try {
      const answer = await status(harness)
      expect(answer["state"]).toBe("needs_sign_in")
      expect(accountsOf(answer)).toEqual([{ alias: "default", state: "needs_sign_in" }])
      expect(String(answer["nextStep"])).toContain("Sign in")
      expect(harness.calls).toEqual([])
    } finally {
      await harness.dispose()
    }
  })

  test("reports a disabled, failed or missing server as that alias's error, with a redacted reason", async () => {
    const cases: { account: HarnessAccount; text: string }[] = [
      { account: { status: "disabled" }, text: "disabled" },
      { account: { status: "failed", reason: "Bad gateway?token=SECRET-7" }, text: "Bad gateway" },
      { account: { status: "missing" }, text: "not registered" },
    ]
    for (const item of cases) {
      const harness = await single(item.account)
      try {
        const answer = await status(harness)
        // `statusAnswer` keeps the plugin's own state ready: the alias carries the error and its reason.
        expect(answer["state"]).toBe("ready")
        const [entry] = accountsOf(answer)
        expect(entry!.state).toBe("error")
        expect(String(entry!.reason)).toContain(item.text)
        expect(String(entry!.reason)).not.toContain("SECRET-7")
        expect(answer["nextStep"]).toBeNull()
      } finally {
        await harness.dispose()
      }
    }
  })

  test("reports every alias, and the aggregate follows the worst state", async () => {
    const harness = await startHarness({
      accounts: { work: { interviews: WORK }, personal: { status: "needs_auth" } },
      now: NOW,
    })
    try {
      const answer = await status(harness)
      expect(accountsOf(answer).map((entry) => [entry.alias, entry.state])).toEqual([
        ["work", "ready"],
        ["personal", "needs_sign_in"],
      ])
      expect(answer["state"]).toBe("needs_sign_in")
    } finally {
      await harness.dispose()
    }
  })

  test("names an agent whose own later allow widens the generated rules", async () => {
    const harness = await startHarness({
      accounts: { work: { interviews: WORK }, personal: {} },
      options: { access: "ask-changes", accounts: { work: {}, personal: {} } },
      looseAgent: true,
      now: NOW,
    })
    try {
      expect((await status(harness))["unguardedAgents"]).toEqual(["loose"])
    } finally {
      await harness.dispose()
    }
  })

  test("treats an unreadable agent list as unknown, never zero", async () => {
    const harness = await startHarness({
      accounts: { work: { interviews: WORK }, personal: {} },
      agentListThrows: true,
      now: NOW,
    })
    try {
      const answer = await status(harness)
      expect(answer["state"]).toBe("error")
      expect(answer["unguardedAgents"]).toEqual([])
      expect(String(answer["nextStep"])).toContain("could not read the agent list")
    } finally {
      await harness.dispose()
    }
  })
})

describe("accounts", () => {
  test("asks for an account when there are two, and names both aliases", async () => {
    const harness = await startHarness({ accounts: { work: { interviews: WORK }, personal: {} }, now: NOW })
    try {
      const required = refusal(await harness.callTool("events_list", {}))
      expect(required.code).toBe("ACCOUNT_REQUIRED")
      expect(required.message).toContain("work")
      expect(required.message).toContain("personal")
      expect(required.message).toContain("Next step: ")
      expect(refusal(await harness.callTool("probe", {})).code).toBe("ACCOUNT_REQUIRED")
      expect(refusal(await harness.callTool("status", { account: "work" })).code).toBe("INPUT_INVALID")
    } finally {
      await harness.dispose()
    }
  })

  test("refuses an alias the plugin does not serve", async () => {
    const harness = await startHarness({ accounts: { work: { interviews: WORK }, personal: {} }, now: NOW })
    try {
      const answer = refusal(await harness.callTool("events_list", { account: "nobodyhere" }))
      expect(answer.code).toBe("ACCOUNT_UNKNOWN")
      expect(answer.message).toContain("work")
      expect(answer.message).toContain("personal")
      expect(answer.message).toContain("Next step: ")
    } finally {
      await harness.dispose()
    }
  })

  test("with one default account, needs no account and names the default credential", async () => {
    const harness = await single()
    try {
      expect(output(await harness.callTool("probe", {}))["account"]).toBe("default")
      expect((output(await harness.callTool("probe", {}))["owner"] as { id: string }).id).toBe("ashby:credential:cred-default")
      expect((output(await harness.callTool("events_list", { since: "2026-11-17T00:00:00Z" }))["events"] as unknown[]).length).toBe(1)
      expect(refusal(await harness.callTool("events_list", { account: "work" })).code).toBe("ACCOUNT_UNKNOWN")
    } finally {
      await harness.dispose()
    }
  })

  test("refuses an invalid alias at setup with OPTIONS_INVALID", async () => {
    await expect(startHarness({ accounts: { Work: {} }, options: { access: "all", accounts: { Work: {} } }, now: NOW })).rejects.toThrow(/OPTIONS_INVALID/)
  })
})

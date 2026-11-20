// The source contract's conformance kit over the source this plugin declares in package.json's `sources`, run on the
// plugin's own events_list and probe methods against invented interviews (test/fixtures/conformance.json: every person,
// job, id and link made up). No Ashby call, no sign-in. The reads go through a fake of OpenCode's executor that asserts
// `ashby_list_interviews` on the kit's recording permission, as the host asserts it, so the kit sees exactly what each
// read asserts. The report is written to reports/conformance-report.json, for a release to attach; it holds no time or
// path, so every run writes the same bytes.
import { describe, expect, test } from "bun:test"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { declarationProblems, sourceConformance, type ConformanceReport, type PageCase, type SessionContext } from "@we-the-rebel-alliance/source-contract/conformance"
import { encodeBoundCursor, encodeCursor } from "@we-the-rebel-alliance/source-contract/cursor"
import { readInstalledDescriptor } from "@we-the-rebel-alliance/source-contract/descriptor"
import { SOURCES_SCHEMA, type Sources } from "@we-the-rebel-alliance/source-contract/schema"
import type { ToolCall } from "@we-the-rebel-alliance/source-contract/tools-rpc"
import { ACCOUNT, EVENTS_DESCRIPTION, LIST_TOOL, PACKAGE, SOURCE, SOURCE_ID, eventsMethod, probeMethod, type EventsContext } from "../../src/events.js"
import { METHODS, TOOLS_RPC_ID } from "../../src/tools-rpc.js"

const root = fileURLToPath(new URL("../..", import.meta.url))
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { name: string; version: string; sources: unknown }
/** The declaration as Memory's schema parses it, which is what the kit takes. */
const checked = SOURCES_SCHEMA.check(pkg.sources)
if (!checked.ok) throw new Error(`the sources declaration is invalid: ${checked.problems.join("; ")}`)
const sources: Sources = checked.value

interface Fixture {
  readonly now: string
  readonly since: string
  readonly credential: { readonly type: "credential"; readonly id: string; readonly label: string }
  readonly interviews: readonly Record<string, unknown>[]
}
const FIXTURE = JSON.parse(readFileSync(join(root, "test", "fixtures", "conformance.json"), "utf8")) as Fixture
const NOW = Date.parse(FIXTURE.now)

/**
 * list_interviews over the fixture, both bounds inclusive, by start, in the envelope a live read recorded:
 * `{ data: { interviews, returnedCount, truncated, onOrAfterDate, onOrBeforeDate, message } }`.
 */
function listInterviews(input: Record<string, unknown>) {
  const from = Date.parse(String(input["onOrAfterDate"]))
  const to = Date.parse(String(input["onOrBeforeDate"]))
  if (typeof input["reason"] !== "string" || input["reason"] === "") throw new Error("list_interviews requires a reason")
  const interviews = FIXTURE.interviews.filter((interview) => Date.parse(String(interview["startTime"])) >= from && Date.parse(String(interview["startTime"])) <= to)
  return { data: { interviews, returnedCount: interviews.length, truncated: false, onOrAfterDate: new Date(from).toISOString(), onOrBeforeDate: new Date(to).toISOString(), message: interviews.length === 0 ? "No interviews found." : `Found ${interviews.length} interviews.` } }
}

/** OpenCode's context for the reads: the list_interviews executor asserts `ashby_list_interviews` first, as the host does. */
function context(permission: SessionContext["permission"]): EventsContext {
  return {
    tool: {
      list: async () =>
        [
          {
            id: `ashby_${LIST_TOOL}`,
            execute: async (input: Record<string, unknown>) => {
              await permission.assert({ action: `ashby_${LIST_TOOL}`, resources: ["*"] } as never)
              return { output: listInterviews(input) }
            },
          },
        ] as never,
    },
    mcp: { list: async () => ({ data: [{ name: "ashby", integrationID: "int-conformance", status: { status: "connected" } }] }) as never },
    permission: permission as never,
    integration: { connection: { active: async () => FIXTURE.credential as never } },
  }
}

/**
 * Why no single interview can fail on its own, for the kit's `failed-holds-cursor` check: one list_interviews call
 * answers each week whole, and a failed call fails the listing.
 */
const ATOMIC =
  "Ashby's list_interviews answers each week of interviews whole, in one call or, when Ashby marks it cut short, in halves; a failed call, or an answer with any entry the reader cannot read, fails the whole listing, so no single interview fails on its own"
/** Why no cursor expires, for the kit's `gap-and-cursor-expired` check. */
const NO_EXPIRY =
  "A cursor is an interview's start and Ashby's interview event id, and list_interviews reads any date range the cursor names, so no history behind a cursor is lost and no cursor expires"

const call = (): ToolCall => ({ sessionID: "ses_conformance", agent: "build", messageID: "msg_script", id: "script:conformance", signal: new AbortController().signal, progress: async () => {} })
const open: SessionContext = { account: ACCOUNT, permission: { assert: async () => {} } }
const list = (input: Record<string, unknown>, session: SessionContext = open) => eventsMethod(context(session.permission), () => true, () => NOW).run(input, call()) as Promise<Record<string, any>>
const probe = (input: Record<string, unknown>, session: SessionContext = open) => probeMethod(context(session.permission), () => true).run(input, call())

/** The plugin's tools RPC methods, as describe lists them: the tools a source may name, each read-only or not. */
const tools = [...METHODS, eventsMethod(context(open.permission), () => true), probeMethod(context(open.permission), () => true)].map((method) => ({ id: method.name, readOnly: method.class === "read" }))

async function cases(): Promise<PageCase[]> {
  const first = (await list({ since: FIXTURE.since, limit: 2 }))["cursor"] as string
  const done = (await list({ since: FIXTURE.since, limit: 500 }))["cursor"] as string
  const bound = (binding: { plugin: string; source: string; account: string }) => encodeBoundCursor(binding, { o: "0123456789abcdef", t: Date.parse(FIXTURE.since), i: "", f: Date.parse(FIXTURE.since), d: "" })
  return [
    { name: "a first listing, one interview refused for a secret and a cancelled one left out", input: { since: FIXTURE.since }, expect: "page" },
    { name: "a first listing that names the account probe answers", input: { account: ACCOUNT, since: FIXTURE.since }, expect: "page" },
    { name: "what came after the first two", input: { account: ACCOUNT, cursor: first }, expect: "page" },
    { name: "the same, two at a time", input: { account: ACCOUNT, cursor: first, limit: 2 }, expect: "page" },
    { name: "nothing new since the last listing", input: { account: ACCOUNT, cursor: done }, expect: "empty" },
    { name: "a week with no interviews", input: { since: "2026-10-25T00:00:00Z", limit: 500 }, expect: "empty" },
    { name: "a cursor without the account it reads", input: { cursor: first }, expect: { refuses: "INPUT_INVALID" } },
    { name: "a cursor passed for another account", input: { account: "work", cursor: first }, expect: { refuses: "ACCOUNT_MISMATCH" } },
    { name: "a cursor issued for another sign-in", input: { account: ACCOUNT, cursor: bound({ plugin: "ashby", source: SOURCE, account: ACCOUNT }) }, expect: { refuses: "ACCOUNT_MISMATCH" } },
    { name: "another source's cursor", input: { account: ACCOUNT, cursor: bound({ plugin: "ashby", source: "candidates", account: ACCOUNT }) }, expect: { refuses: "CURSOR_INVALID" } },
    { name: "a cursor bound to another plugin", input: { account: ACCOUNT, cursor: bound({ plugin: "metaview", source: SOURCE, account: ACCOUNT }) }, expect: { refuses: "CURSOR_INVALID" } },
    { name: "an unbound cursor", input: { account: ACCOUNT, cursor: encodeCursor(SOURCE, { o: "0123456789abcdef", t: 0, i: "" }) }, expect: { refuses: "CURSOR_INVALID" } },
    { name: "a source this plugin does not have", input: { source: "candidates" }, expect: { refuses: "SOURCE_UNKNOWN" } },
  ]
}

const reports: ConformanceReport[] = []

describe("the source contract's conformance kit", () => {
  test("the declaration validates, as a consumer reads it from the installed package", () => {
    const installed = readInstalledDescriptor(root, { version: pkg.version })
    expect(installed.ok ? [] : installed.problems).toEqual([])
    expect(declarationProblems(pkg.sources, { tools })).toEqual([])
    expect(sources.rpc).toBe(TOOLS_RPC_ID)
    expect(pkg.name).toBe(PACKAGE)
    expect(sources.items.map((item) => [item.id, item.kind])).toEqual([[SOURCE_ID, "events"]])
  })

  test("the descriptor and the read agree: one account, default, which probe names and every page carries", async () => {
    const source = sources.items.find((item) => item.id === SOURCE_ID)!
    expect(source.accounts).toEqual({ named: false })
    const probed = (await probe({})) as { account: string; owner: unknown }
    expect(probed).toMatchObject({ account: ACCOUNT, owner: { id: "ashby:credential:cred-conformance", label: "ada@example.test" } })
    // Keys a consumer on source-contract 0.1.x refuses are neither declared nor sent until jelly and Memory have
    // re-vendored 0.2.0 (CHANGELOG, Known limits); then the owner carries verified: false and identity is [].
    expect(probed.owner).not.toHaveProperty("verified")
    expect(sources.items[0]!.permission).not.toHaveProperty("identity")
    expect(await list({ account: probed.account, since: FIXTURE.since, limit: 1 })).toMatchObject({ account: ACCOUNT, owner: probed.owner })
  })

  test("what is read is stated exactly, since the contract has no consent sentence for a source with no scope key to choose", () => {
    const source = sources.items.find((item) => item.id === SOURCE_ID)!
    // contract 0.3.0 reads `scope.describe` only with at least one scope key: this source has nothing to choose, so it
    // declares none, and the statement lives in events_list's own description and the README.
    expect(source.scope).toBeUndefined()
    const sentence = EVENTS_DESCRIPTION.toLowerCase()
    expect(sentence).toContain("signed-in user's own ashby interviews")
    for (const word of ["metadata", "contact details", "feedback", "scorecards", "notes", "transcripts"]) expect({ word, said: sentence.includes(word) }).toEqual({ word, said: true })
    // The one read is the one Ashby itself describes as the current user's interviews (a live capture of the tool list).
    expect(source.permission.operations).toEqual([LIST_TOOL])
    const captured = JSON.parse(readFileSync(join(root, "test", "fixtures", "live-tools.json"), "utf8")) as { tools: { name: string; description: { text: string } }[] }
    expect(captured.tools.find((tool) => tool.name === LIST_TOOL)?.description.text).toMatch(/^Search the current Ashby user's interviews/)
  })

  test(`${SOURCE_ID} keeps the contract, every check run or stated not to apply`, async () => {
    const source = sources.items.find((item) => item.id === SOURCE_ID)!
    const report = await sourceConformance({
      plugin: pkg.name,
      source,
      tools,
      calls: {
        list: (input, session) => list(input as Record<string, unknown>, session),
        probe: (input, session) => probe(input as Record<string, unknown>, session),
      },
      cases: await cases(),
      account: ACCOUNT,
      sources,
      describe: { id: TOOLS_RPC_ID },
      atomicPages: { reason: ATOMIC },
      noExpiry: { reason: NO_EXPIRY },
    })
    reports.push(report)
    expect(report.problems).toEqual([])
    expect(report.checks.filter((check) => !check.ran && !check.notApplicable).map((check) => check.name)).toEqual([])
    expect(report.incomplete).toBe(false)
    expect(report.ok).toBe(true)
  })

  test("writes the report a release attaches", () => {
    expect(reports.map((report) => report.source)).toEqual([SOURCE_ID])
    const installed = readInstalledDescriptor(root, { version: pkg.version })
    const contract = JSON.parse(readFileSync(join(root, "node_modules", "@we-the-rebel-alliance", "source-contract", "package.json"), "utf8")) as { version: string }
    const report = {
      contract: `@we-the-rebel-alliance/source-contract@${contract.version}`,
      plugin: pkg.name,
      version: pkg.version,
      fixture: "test/fixtures/conformance.json",
      descriptorHash: installed.ok ? installed.value.hash : null,
      ok: reports.every((entry) => entry.ok),
      sources: reports,
    }
    expect(report.ok).toBe(true)
    mkdirSync(join(root, "reports"), { recursive: true })
    writeFileSync(join(root, "reports", "conformance-report.json"), `${JSON.stringify(report, null, 2)}\n`)
  })
})

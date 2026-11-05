// The drift script against saved tool lists: the recorded list of names (the research form), OpenCode's form with
// schemas, and edited copies. It reads files only.
import { afterAll, describe, expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { DENIED_TOOLS, PARAMETERS, READ_TOOLS, WRITE_TOOLS } from "../../src/ashby-tools.js"

const SCRIPT = fileURLToPath(new URL("../../scripts/check-ashby-tools.mjs", import.meta.url))
const TOOLS = fileURLToPath(new URL("../../src/ashby-tools.ts", import.meta.url))
const FIXTURE = fileURLToPath(new URL("./ashby-tools.json", import.meta.url))
const dir = mkdtempSync(join(tmpdir(), "ashby-drift-"))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

const ALL = [...READ_TOOLS, ...WRITE_TOOLS, ...DENIED_TOOLS]
const recorded = () => (JSON.parse(readFileSync(FIXTURE, "utf8")) as { tools: { name: string }[] }).tools
/** One tool in OpenCode's form, with a schema. */
const opencode = (name: string, properties: Record<string, unknown> = { query: { type: "string" } }, required = ["query"], description = `Ashby ${name}`) => ({
  id: `ashby_${name}`,
  name,
  description,
  inputSchema: { type: "object", properties, required },
})

let files = 0
function drift(list: unknown, args: string[] = [], script = SCRIPT) {
  const file = join(dir, `tools-${++files}.json`)
  writeFileSync(file, JSON.stringify(list))
  const result = spawnSync("node", [script, file, ...args], { encoding: "utf8" })
  return { code: result.status, out: result.stdout, err: result.stderr }
}

/** A copy of the script next to a copy of the tool record whose PARAMETERS records `parameters`. */
function withParameters(parameters: Record<string, string[]>) {
  const root = mkdtempSync(join(dir, "recorded-"))
  mkdirSync(join(root, "scripts"))
  mkdirSync(join(root, "src"))
  copyFileSync(SCRIPT, join(root, "scripts", "check-ashby-tools.mjs"))
  const source = readFileSync(TOOLS, "utf8").replace(/export const PARAMETERS: Readonly<Record<string, readonly string\[\]>> = \{\}/, `export const PARAMETERS: Readonly<Record<string, readonly string[]>> = ${JSON.stringify(parameters)}`)
  expect(source).toContain(JSON.stringify(parameters))
  writeFileSync(join(root, "src", "ashby-tools.ts"), source)
  return join(root, "scripts", "check-ashby-tools.mjs")
}

describe("npm run drift", () => {
  test("PARAMETERS records only known tools, each as name, required mark and type", () => {
    expect(Object.keys(PARAMETERS).filter((name) => !ALL.includes(name))).toEqual([])
    for (const entries of Object.values(PARAMETERS)) for (const entry of entries) expect(entry).toMatch(/^[a-z][a-z0-9_]*\*?:[a-z<>|]+$/)
  })

  test("the recorded list holds exactly the known tools, and shows no drift", () => {
    expect(recorded().map((tool) => tool.name).sort()).toEqual([...ALL].sort())
    const { code, out } = drift({ tools: recorded() }, ["--strict"])
    expect(out).toContain("Not checked: this list gives no input schemas")
    expect([code, out.trim().split("\n").at(-1)]).toEqual([0, "No drift."])
  })

  test("a list with schemas names every known tool whose parameters PARAMETERS does not record yet, as drift", () => {
    const tools = ALL.map((name) => opencode(name))
    const { code, out } = drift({ tools }, ["--strict"])
    const missing = ALL.filter((name) => !PARAMETERS[name])
    if (missing.length) {
      expect(code).toBe(1)
      expect(out).toContain("Parameters to record: the list gives this known tool's input, which PARAMETERS does not have yet:")
      for (const name of missing) expect(out).toContain(`  ${name}: query*:string`)
    } else expect(code).toBe(0)
  })

  test("once recorded, a parameter that is added, removed, made required or retyped is drift", () => {
    const script = withParameters(Object.fromEntries(ALL.map((name) => [name, ["query*:string", "limit:integer"]])))
    const same = ALL.map((name) => opencode(name, { query: { type: "string" }, limit: { type: "integer" } }))
    expect(drift({ tools: same }, ["--strict"], script)).toMatchObject({ code: 0, out: expect.stringContaining("No drift.") })
    const changed = same.map((tool) =>
      tool.name === "filter_records" ? opencode("filter_records", { query: { type: "string" }, limit: { type: "string" }, count_only: { type: "boolean" } }, ["query", "count_only"]) : tool,
    )
    const { code, out } = drift({ tools: changed }, ["--strict"], script)
    expect(code).toBe(1)
    expect(out).toContain("  filter_records: +count_only*:boolean limit (integer -> string)")
  })

  test("reports added and possibly renamed tools, and treats removed tools as information", () => {
    const script = withParameters(Object.fromEntries(ALL.map((name) => [name, [`${name}_id*:string`, "limit:integer"]])))
    const tools = ALL.filter((name) => name !== "get_pending_tasks" && name !== "get_job_pipeline").map((name) => opencode(name, { [`${name}_id`]: { type: "string" }, limit: { type: "integer" } }, [`${name}_id`]))
    tools.push(opencode("list_my_tasks", { get_pending_tasks_id: { type: "string" }, limit: { type: "integer" } }, ["get_pending_tasks_id"]))
    const { code, out } = drift({ tools }, ["--strict"], script)
    expect(code).toBe(1)
    expect(out).toContain("Added: listed by Ashby, in no list of src/ashby-tools.ts:\n  list_my_tasks")
    expect(out).toContain("Removed: in src/ashby-tools.ts, not in this list")
    expect(out).toContain("  get_job_pipeline")
    expect(out).toContain("Possibly renamed: a removed tool and an added one take mostly the same parameters:\n  get_pending_tasks -> list_my_tasks")
  })

  test("a read whose description says it changes or sends something is flagged; nouns and other tools are not", () => {
    const quiet = [
      opencode("get_record_details", {}, [], "Full details of a Job Posting, an Offer or an Application."),
      opencode("get_interview_plan", {}, [], "The stages of a plan; move a candidate with change_application_stage."),
      opencode("search_product_docs", {}, [], "1. Create a candidate with create_candidate after reading the docs."),
    ]
    const loud = [opencode("get_pending_tasks", {}, [], "Sends a reminder to every interviewer who owes feedback."), opencode("filter_records", {}, [], "This tool creates a saved view.")]
    const others = ALL.filter((name) => ![...quiet, ...loud].some((tool) => tool.name === name)).map((name) => opencode(name, {}, []))
    const { out } = drift({ tools: [...others, ...quiet, ...loud] })
    expect(out).toContain("  get_pending_tasks  (Sends)")
    expect(out).toContain("  filter_records  (creates)")
    for (const tool of quiet) expect(out).not.toContain(`  ${tool.name}  (`)
  })

  test("a list from an MCP client with annotations shows a read that became a write", () => {
    const tools = recorded().map((tool) => ({ ...tool, annotations: { readOnlyHint: READ_TOOLS.includes(tool.name), destructiveHint: false } }))
    tools.find((tool) => tool.name === "get_candidate")!.annotations = { readOnlyHint: false, destructiveHint: false }
    const { code, out } = drift({ tools })
    expect(code).toBe(0)
    expect(out).toContain("Reclassified: the lists disagree with Ashby's annotations:\n  get_candidate  readOnlyHint=false destructiveHint=false")
  })

  test("a removed tool alone is not drift: Ashby may list fewer tools for less access", () => {
    const { code, out } = drift({ tools: recorded().filter((tool) => READ_TOOLS.includes(tool.name)) }, ["--strict"])
    expect(code).toBe(0)
    expect(out).toContain("No drift apart from the removed tools above.")
  })

  test("refuses a file that is not a tool list, and a missing argument, with exit code 2", () => {
    expect(drift({ servers: [] }).code).toBe(2)
    const none = spawnSync("node", [SCRIPT], { encoding: "utf8" })
    expect(none.status).toBe(2)
    expect(none.stderr).toContain("no tool list given")
  })
})

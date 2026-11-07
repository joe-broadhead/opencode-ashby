// Ashby's part of the tools RPC: the plugin-specific block of src/host/tools-rpc.ts. The shared part is tested in
// tools-rpc.test.ts. The methods come from src/ashby-tools.ts, the same table the drop-in reconcile test reads the
// fixture against, so replacing test/unit/ashby-tools.json with a signed-in live list updates both in one step.
import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { DENIED_TOOLS, READ_TOOLS, WRITE_TOOLS } from "../../src/ashby-tools.js"
import { PLUGIN_ID as ASHBY_PLUGIN_ID, SERVER_NAME } from "../../src/constants.js"
import { METHODS, NEXT_STEPS, PLUGIN_ID, pluginError, shapeInput, shapeResult, TOOLS_RPC_ID } from "../../src/host/tools-rpc.js"
import { defaultRules } from "../../src/permissions.js"

const RECORDED = (JSON.parse(readFileSync(new URL("./ashby-tools.json", import.meta.url), "utf8")) as { tools: { name: string }[] }).tools.map((tool) => tool.name)
const CLASS_OF = new Map<string, string>([
  ...READ_TOOLS.map((name) => [name, "read"] as const),
  ...WRITE_TOOLS.map((name) => [name, "write"] as const),
  ...DENIED_TOOLS.map((name) => [name, "destructive"] as const),
])

describe("Ashby's tools RPC", () => {
  test("is ashby.recruiting.tools, under the plugin's own id", () => {
    expect(PLUGIN_ID).toBe(ASHBY_PLUGIN_ID)
    expect(TOOLS_RPC_ID).toBe("ashby.recruiting.tools")
  })

  test("its methods are every known tool by exact name, the same list the fixture reconciles to", () => {
    const names = METHODS.map((method) => method.name)
    expect(new Set(names).size).toBe(names.length)
    expect([...names].sort()).toEqual([...RECORDED].sort())
    expect([...names].sort()).toEqual([...READ_TOOLS, ...WRITE_TOOLS, ...DENIED_TOOLS].sort())
    for (const name of ["shiny_new_tool", "describe", "*"]) expect(names).not.toContain(name)
    for (const method of METHODS) expect(method.kind).toBe("mcp")
  })

  test("gives each method its class: reads, writes, and the two the default rules deny", () => {
    const allowed = defaultRules().filter((rule) => rule.effect === "allow").map((rule) => rule.action)
    const denied = defaultRules().filter((rule) => rule.effect === "deny").map((rule) => rule.action)
    for (const method of METHODS) {
      expect(CLASS_OF.get(method.name)).toBe(method.class)
      const action = `${SERVER_NAME}_${method.name}`
      if (method.class === "read") expect(allowed).toContain(action)
      if (method.class === "destructive") expect(denied).toContain(action)
    }
  })

  test("names Ashby's own commands in its next steps, the rate limit, and the location header", () => {
    expect(NEXT_STEPS.AUTH_REQUIRED).toContain("/connect and choose Ashby")
    expect(NEXT_STEPS.SERVER_CONFLICT).toContain("mcp.servers.ashby")
    expect(NEXT_STEPS.TOOL_UNAVAILABLE).toBe("Call describe to see which methods OpenCode lists now, and run /ashby-status.")
    expect(NEXT_STEPS.UPSTREAM_ERROR).toContain("if Ashby reports a rate limit, wait a minute and make fewer calls at once")
    expect(NEXT_STEPS.SESSION_UNKNOWN).toContain("x-opencode-directory")
    for (const step of Object.values(NEXT_STEPS)) expect(step).toMatch(/[^.]\.$/)
    expect(NEXT_STEPS.ACCOUNT_UNKNOWN).toBeUndefined()
  })

  test("passes every input and result through unchanged, and has no errors of its own", () => {
    const call = { sessionID: "ses_1", agent: "build", action: `${SERVER_NAME}_get_candidate` }
    const result = { output: { name: "Example Candidate" }, text: "{}" }
    for (const method of METHODS) {
      expect(shapeInput(method.name, { query: "q" }, call)).toEqual({ query: "q" })
      expect(shapeResult(method.name, result, call)).toBe(result)
    }
    expect(pluginError(new Error("boom"))).toBeUndefined()
  })
})

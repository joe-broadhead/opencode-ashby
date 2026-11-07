// The plugin on the public @opencode/sdk host: H1 load and connect, H2 what runs and what asks, H3 the permission
// model (P1-P5), H4 adoption and conflict, H5 /ashby-status, H6 unload, the user's own server with a header secret that
// never reaches status or a script, the two denied tools on every path (direct, model turns with Code Mode off and on,
// scripts) and their opt-in, a server that asks for a sign-in, the scopes and registration of the sign-in OpenCode
// starts, and the /connect entry. Each describe owns one host.
import { ROOT } from "./isolate.js"
import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test"
import { existsSync, mkdirSync, realpathSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, sep } from "node:path"
import { Plugin } from "@opencode/plugin"
import { SUPPORTED_HOST, TESTED_HOSTS } from "../../src/constants.js"
import { DENIED_TOOLS, WRITE_TOOLS } from "../../src/ashby-tools.js"
import { defaultRules, type Rule } from "../../src/permissions.js"
import { SKILL_NAMES } from "../../src/skills.js"
import { StatusRpc } from "../../src/status.js"
import { TOOLS_RPC_ID } from "../../src/host/tools-rpc.js"
import { ASHBY_SCOPES, MODEL_ID } from "./fake-mcp.js"
import { agentRules, attempt, cleanup, effect, HOST_VERSION, session, startHost, until, type Host } from "./harness.js"

const AGENT_RULES = defaultRules().map((rule, index, rules) => `  ${JSON.stringify(rule)}${index < rules.length - 1 ? "," : ""}`).join("\n")
const AGENTS_NEXT_STEP = "Put the default rules shown by /ashby-status first in each listed agent's own permissions, in opencode.json or the agent's Markdown file, followed by your top-level rules for Ashby tools."
const KEY = "sk-fake-host-test-0123456789"
const SIGN_IN = "Run /connect and choose Ashby, then press o or Enter to open the link (in a terminal, opencode mcp auth ashby opens it automatically in this project's folder; if it answers MCP server not found: ashby, wait a few seconds and run it again)."
const OFF = "change_application_stage and submit_mcp_feedback"
const SIGN_IN_AGAIN = "Ashby needs a new sign-in. Choose this account to sign in again."

// Starting a host takes several seconds, more on a busy machine.
setDefaultTimeout(120_000)
afterAll(cleanup)

const BUILT_IN = ["build", "general", "explore", "compaction", "title", "summary", "plan"]
const allow = (tool: string): Rule => ({ action: `ashby_${tool}`, resource: "*", effect: "allow" })
const deny = (tool: string): Rule => ({ action: `ashby_${tool}`, resource: "*", effect: "deny" })
const wildcard = (pattern: string) => new RegExp(`^${pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`)
/** The host hides a tool when the last rule matching its action is a deny on every resource. */
const hidden = (rules: readonly Rule[], action: string) => {
  const last = rules.findLast((rule) => wildcard(rule.action).test(action))
  return last?.resource === "*" && last.effect === "deny"
}

/**
 * The host lists an MCP server's tools shortly after it connects. The registry lists the two denied tools too; the
 * deny hides them from the model's tools and refuses them.
 */
const ashbyTools = (host: Host) =>
  until("Ashby's tools are registered", async () => {
    const ids = (await host.probe().tool.list()).map((tool) => tool.id).filter((id) => id.startsWith("ashby_"))
    return ids.length === 8 && ids.sort()
  })

async function status(host: Host, sessionID: string) {
  await host.client.sessions.command({ sessionID, name: "ashby-status", text: "" })
  return until("/ashby-status posts its text", async () => {
    const inbox = await host.client.session.inbox.list({ sessionID })
    const posted = inbox.findLast((item) => item.type === "synthetic")
    return posted?.type === "synthetic" ? posted.payload.text : undefined
  })
}

/** Enough of the tools RPC's contract for the client to call describe and the methods these tests use. */
const TOOLS_CONTRACT = {
  id: TOOLS_RPC_ID,
  methods: Object.fromEntries(["describe", "get_pending_tasks", "search_records_by_name", "create_candidate", ...DENIED_TOOLS].map((name) => [name, { input: { type: "object" }, output: { type: "object" } }])),
  events: {},
}
type ToolsClient = Record<string, (input: object, options: object) => Promise<unknown>>
const toolsRpc = (host: Host) => (host.client.rpc as unknown as (definition: object) => ToolsClient)(TOOLS_CONTRACT)
/** A tools RPC call's output, or its error as JSON, so a test can search either for a secret. */
const scriptCall = (host: Host, method: string, input: object) =>
  toolsRpc(host)[method]!(input, { location: host.location }).then(
    (output) => JSON.stringify(output),
    (error: unknown) => JSON.stringify(error, Object.getOwnPropertyNames(error ?? {})),
  )

/** A session whose own rules are the grant a script needs: a blanket deny, then one allow per method it may call. */
const grantedSession = async (host: Host, permissions: Rule[]) =>
  (await host.client.sessions.create({ agent: "build", permissions, location: host.location })).id

const statusRpc = (host: Host) => (host.client.rpc as unknown as (definition: typeof StatusRpc) => { status: (input: object, options: object) => Promise<Record<string, unknown>> })(StatusRpc).status({}, { location: host.location })

describe(`the plugin on OpenCode ${HOST_VERSION}`, () => {
  let host: Host
  beforeAll(async () => {
    host = await startHost({ config: () => ({ agents: { reviewer: { description: "Reviews changes", mode: "subagent" } } }) })
  })
  afterAll(() => host?.close())

  test("the host's global folders, temp folder and working directory are inside the test's temp root", async () => {
    const global = ["XDG_DATA_HOME", "XDG_STATE_HOME", "XDG_CACHE_HOME"].map((key) => join(process.env[key]!, "opencode"))
    expect(global.filter((path) => !existsSync(path))).toEqual([])
    const { paths } = await host.client.server.info()
    const used = [...global, realpathSync(paths.tmp), process.env.OPENCODE_TEST_HOME!, tmpdir(), process.cwd()]
    expect(used.filter((path) => !path.startsWith(ROOT + sep))).toEqual([])
  })

  test("H1: the plugin is active, ashby is connected, and its tools, skills and command are registered", async () => {
    const { data: plugins } = await host.client.plugin.list({ location: host.location })
    expect(plugins.find((plugin) => plugin.id === "ashby.recruiting")?.state.status).toBe("active")
    const { data: servers } = await host.client.mcp.list({ location: host.location })
    expect(servers.find((server) => server.name === "ashby")?.status).toEqual({ status: "connected" })
    expect(await ashbyTools(host)).toEqual([...["get_pending_tasks", "search_records_by_name", "shiny_new_tool", ...WRITE_TOOLS, ...DENIED_TOOLS].map((tool) => `ashby_${tool}`)].sort())
    const { data: skills } = await host.client.skill.list({ location: host.location })
    expect(skills.map((skill) => skill.id).filter((id) => id.startsWith("ashby")).sort()).toEqual([...SKILL_NAMES].sort())
    const { data: commands } = await host.client.command.list({ location: host.location })
    expect(commands.map((command) => command.name)).toContain("ashby-status")
  })

  test("P1: the rules sit right after the base allow in every built-in agent, once", async () => {
    const rules = await agentRules(host)
    for (const id of BUILT_IN) {
      const permissions = rules.get(id)!
      const base = permissions.findIndex((rule) => rule.action === "*" && rule.resource === "*" && rule.effect === "allow")
      expect(base).toBe(0)
      expect(permissions.slice(base + 1, base + 1 + defaultRules().length)).toEqual(defaultRules())
      expect(permissions.filter((rule) => rule.action === "ashby_*")).toHaveLength(1)
    }
  })

  test("P1: Plan and Explore are not weakened", async () => {
    expect(await effect(host, "plan", "edit")).toBe("deny")
    expect(await effect(host, "explore", "ashby_search_records_by_name")).toBe("deny")
    const explore = await session(host, "explore")
    expect(await attempt(host, explore, "explore", "search_records_by_name")).toEqual({ asked: undefined, ok: false, error: "Tool.Error: Permission denied: ashby_search_records_by_name" })
    const plan = await session(host, "plan")
    expect(await attempt(host, plan, "plan", "shiny_new_tool")).toMatchObject({ asked: "ashby_shiny_new_tool", ok: false })
  })

  test("P2 and H2: known reads run without a prompt, everything else asks, and the two denied tools are hidden", async () => {
    const build = await session(host)
    const before = host.fake.calls.length
    expect(await attempt(host, build, "build", "search_records_by_name")).toMatchObject({ asked: undefined, ok: true })
    expect(await attempt(host, build, "build", "shiny_new_tool")).toEqual({ asked: "ashby_shiny_new_tool", ok: false, error: "Permission.DeclinedError: " })
    // Every known write asks, and a declined ask never reaches Ashby. consider_candidate_for_job matters most: its
    // first stage's automations can email the candidate.
    for (const tool of WRITE_TOOLS) {
      expect({ tool, result: await attempt(host, build, "build", tool) }).toEqual({ tool, result: { asked: `ashby_${tool}`, ok: false, error: "Permission.DeclinedError: " } })
    }
    expect(host.fake.calls.slice(before)).toEqual(["search_records_by_name"])
    const rules = (await agentRules(host)).get("build")!
    expect(["ashby_search_records_by_name", "ashby_add_note_to_candidate", "ashby_shiny_new_tool"].filter((action) => hidden(rules, action))).toEqual([])
    // Each denied tool is hidden, refused with no prompt even when "always" would be the answer, and never reaches
    // Ashby, in every built-in agent.
    const all = await agentRules(host)
    for (const tool of DENIED_TOOLS) {
      for (const id of BUILT_IN) expect({ id, tool, hidden: hidden(all.get(id)!, `ashby_${tool}`) }).toEqual({ id, tool, hidden: true })
      expect(await effect(host, "build", `ashby_${tool}`)).toBe("deny")
      expect(await attempt(host, build, "build", tool, "always")).toEqual({ asked: undefined, ok: false, error: `Tool.Error: Permission denied: ashby_${tool}` })
      expect(host.fake.calls).not.toContain(tool)
    }
  })

  test("a script's read runs, and a write runs only in a session that names an allow for it", async () => {
    const reader = await session(host)
    const before = host.fake.calls.length
    const read = JSON.parse(await scriptCall(host, "get_pending_tasks", { sessionID: reader, input: {} })) as { text: string }
    expect(read.text).toBe("called get_pending_tasks")
    expect(host.fake.calls.slice(before)).toEqual(["get_pending_tasks"])
    const writer = await grantedSession(host, [{ action: "*", resource: "*", effect: "deny" }, { action: "ashby_create_candidate", resource: "*", effect: "allow" }])
    const write = JSON.parse(await scriptCall(host, "create_candidate", { sessionID: writer, input: { query: "Example Candidate" } })) as { text: string }
    expect(write.text).toBe("called create_candidate")
    expect(host.fake.calls.at(-1)).toBe("create_candidate")
  })

  test("a write that would ask is refused before dispatch, with no Ashby call", async () => {
    const before = host.fake.calls.length
    const refused = JSON.parse(await scriptCall(host, "create_candidate", { sessionID: await session(host), input: { query: "Example Candidate" } })) as { message: string }
    expect(refused.message).toContain("PERMISSION_DENIED: ashby_create_candidate would ask")
    expect(host.fake.calls.length).toBe(before)
  })

  test("describe with a session reports each method's class and permission, and without one no permission", async () => {
    const described = JSON.parse(await scriptCall(host, "describe", { sessionID: await session(host) })) as {
      location: string
      locationHint: string
      methods: { name: string; class: string; permission?: string }[]
    }
    const find = (name: string) => described.methods.find((method) => method.name === name)!
    expect(find("get_pending_tasks")).toMatchObject({ class: "read", permission: "allow" })
    expect(find("create_candidate")).toMatchObject({ class: "write", permission: "ask" })
    expect(find("change_application_stage")).toMatchObject({ class: "destructive", permission: "deny" })
    expect(described.location).toBe(host.location.directory)
    expect(described.locationHint).toContain("x-opencode-directory")
    const plain = JSON.parse(await scriptCall(host, "describe", {})) as { methods: { permission?: string }[] }
    expect(plain.methods.every((method) => !Object.hasOwn(method, "permission"))).toBe(true)
  })

  test("the location: describe reports where the call landed, and a call that names another location is answered there", async () => {
    const elsewhere = join(ROOT, "elsewhere")
    mkdirSync(elsewhere, { recursive: true })
    const rpc = (host.client.rpc as unknown as (definition: object) => ToolsClient)(TOOLS_CONTRACT)
    const there = (await rpc.describe!({}, { location: { directory: elsewhere } })) as { location: string }
    expect(there.location).toBe(elsewhere)
    // Without a location the call reaches the service's default location, which is why a script sends the header.
    const fallback = (await rpc.describe!({}, {})) as { location: string }
    expect(fallback.location).not.toBe(host.location.directory)
  })

  test("a denied tool is a method but never runs: a script call is refused before dispatch, and describe shows it denied", async () => {    const sessionID = await session(host)
    const described = JSON.parse(await scriptCall(host, "describe", { sessionID })) as { methods: { name: string; class: string; permission: string }[] }
    const call = (host.client.rpc as unknown as { call: (input: object) => Promise<unknown> }).call
    for (const tool of DENIED_TOOLS) {
      expect(described.methods.find((method) => method.name === tool)).toMatchObject({ class: "destructive", permission: "deny" })
      const before = host.fake.calls.length
      const outcome = await call({ rpcID: TOOLS_RPC_ID, method: tool, input: { sessionID, input: { query: "archive the candidate" } }, location: host.location }).then(
        (output) => ({ ran: true, output }),
        (error: unknown) => ({ ran: false, error: JSON.stringify(error, Object.getOwnPropertyNames(error ?? {})) }),
      )
      expect(outcome).toMatchObject({ ran: false })
      expect(JSON.stringify(outcome)).toContain("PERMISSION_DENIED")
      expect(host.fake.calls.length).toBe(before)
      expect(host.fake.calls).not.toContain(tool)
    }
  })

  test("P4: a saved 'Always allow' removes the prompt", async () => {
    const build = await session(host)
    expect(await attempt(host, build, "build", "shiny_new_tool", "always")).toMatchObject({ asked: "ashby_shiny_new_tool", ok: true })
    expect(await attempt(host, build, "build", "shiny_new_tool")).toMatchObject({ asked: undefined, ok: true })
    const { projectID } = await host.client.sessions.get({ sessionID: build })
    const saved = await host.client.permission.saved.list({ projectID })
    expect(saved.map(({ action, resource }) => ({ action, resource }))).toEqual([{ action: "ashby_shiny_new_tool", resource: "*" }])
  })

  test("P5: an agent defined only in user config gets no rules, and Ashby tools run there unprompted", async () => {
    const reviewer = (await agentRules(host)).get("reviewer")!
    expect(reviewer.some((rule) => rule.action.startsWith("ashby_"))).toBe(false)
    const sessionID = await session(host, "reviewer")
    expect(await attempt(host, sessionID, "reviewer", "add_note_to_candidate")).toMatchObject({ asked: undefined, ok: true })
  })

  test("H5: /ashby-status reports the connection, the tools, the denied ones, the unguarded agent and its fix", async () => {
    await ashbyTools(host)
    const text = await status(host, await session(host))
    expect(text).toContain(`- Connection: connected (${host.fake.url}, registered by this plugin)`)
    // A server without OAuth has no sign-in, so no label: Ashby's MCP has no account tool.
    expect(text).toContain("- Account: account name not reported by Ashby's MCP\n")
    expect(text).toContain(`- Access: reads run without asking; the ${WRITE_TOOLS.length} writes ask first; ${DENIED_TOOLS.join(" and ")} are off; default rules missing in the agents listed below\n`)
    expect(text).toContain(`- Tools: 6 available, 1 unknown: shiny_new_tool (unknown tools ask before running); off by default: ${OFF}\n`)
    expect(text).toContain(`- Agents without default rules: reviewer\n${AGENT_RULES}\n`)
    expect(text).toContain(`- Next step: ${AGENTS_NEXT_STEP}`)
    expect(text).toContain(`- OpenCode: ${HOST_VERSION} (${TESTED_HOSTS.includes(HOST_VERSION) ? "tested" : "untested"}; supported range ${SUPPORTED_HOST})`)
    expect(text).not.toContain("Plan")
    const output = await statusRpc(host)
    expect(output).toMatchObject({ state: "connected", tools: 6, deniedTools: [...DENIED_TOOLS], unknownCount: 1, listing: false, unguardedAgents: ["reviewer"] })
    expect(output).not.toHaveProperty("account")
  })

  test("H6: unloading the plugin removes the server, the rules and the command", async () => {
    // Registering a plugin with the same ID replaces the old generation, which disposes everything it registered.
    await host.client.plugin(Plugin.define({ id: "ashby.recruiting", setup: () => {} }))
    await until("the ashby server is gone", async () => {
      const { data } = await host.client.mcp.list({ location: host.location })
      return !data.some((server) => server.name === "ashby")
    })
    const rules = await agentRules(host)
    for (const id of BUILT_IN) expect(rules.get(id)!.some((rule) => rule.action.startsWith("ashby_"))).toBe(false)
    const { data: commands } = await host.client.command.list({ location: host.location })
    expect(commands.map((command) => command.name)).not.toContain("ashby-status")
  })
})

describe("the user's own ashby server, with a secret in its headers", () => {
  let host: Host
  beforeAll(async () => {
    host = await startHost({
      config: (url) => ({ mcp: { servers: { ashby: { type: "remote", url, oauth: false, headers: { "x-ashby-test": "user", Authorization: `Bearer ${KEY}` } } } } }),
    })
  })
  afterAll(() => host?.close())

  test("H4: is adopted unchanged: the host sends its headers, and the plugin's rules still apply", async () => {
    expect(await attempt(host, await session(host), "build", "search_records_by_name")).toMatchObject({ asked: undefined, ok: true })
    expect(await attempt(host, await session(host), "build", "add_note_to_candidate")).toMatchObject({ asked: "ashby_add_note_to_candidate", ok: false })
    expect(host.fake.markers.length).toBeGreaterThan(0)
    expect(new Set(host.fake.markers)).toEqual(new Set(["user"]))
    expect(new Set(host.fake.authorizations)).toEqual(new Set([`Bearer ${KEY}`]))
  })

  test("the secret never reaches /ashby-status or the status RPC, which name the entry as the user's own", async () => {
    const text = await status(host, await session(host))
    expect(text).toContain(`- Connection: connected (${host.fake.url}, your own mcp.servers.ashby without OAuth, used unchanged)`)
    const output = await statusRpc(host)
    expect(output).toMatchObject({ state: "connected", source: { type: "adopted", signIn: "own" } })
    for (const shown of [text, JSON.stringify(output)]) {
      expect(shown).not.toContain(KEY)
      expect(shown).not.toMatch(/Bearer|Authorization/i)
    }
  })

  test("the secret never reaches a script: not describe, a result or an upstream error", async () => {
    const sessionID = await session(host)
    const describe = await scriptCall(host, "describe", {})
    expect(describe).toContain("search_records_by_name")
    const result = await scriptCall(host, "search_records_by_name", { sessionID, input: { query: "Example Candidate" } })
    expect(result).toContain("called search_records_by_name")
    const failure = await scriptCall(host, "search_records_by_name", { sessionID, input: { query: "fail" } })
    expect(failure).toContain("UPSTREAM_ERROR")
    for (const shown of [describe, result, failure]) {
      expect(shown).not.toContain(KEY)
      expect(shown).not.toMatch(/Bearer/i)
    }
  })
})

const scripted = (host: Host) => host.client.sessions as unknown as {
  create: (input: object) => Promise<{ id: string }>
  prompt: (input: object) => Promise<unknown>
}

/** A host whose own `ashby` entry points at the fake, whose model is the fake's scripted model, with Code Mode on or off. */
async function modelHost(codemode: boolean) {
  const host = await startHost({
    config: (url) => ({
      mcp: { servers: { ashby: { type: "remote", url, oauth: false, ...(codemode ? {} : { codemode: false }) } } },
      // No model leaves the machine: LM Studio's local API is the fake; the other local providers are off.
      providers: { lmstudio: { settings: { baseURL: `${new URL(url).origin}/v1` } }, ollama: { settings: { baseURL: "" } }, vllm: { settings: { baseURL: "" } } },
    }),
  })
  const models = host.client as unknown as { model: { list: (input: object) => Promise<{ data: { id: string; providerID: string }[] }> } }
  await until("the scripted model is listed", async () => (await models.model.list({ location: host.location })).data.find((model) => model.providerID === "lmstudio" && model.id === MODEL_ID))
  await ashbyTools(host)
  return host
}

describe("a model turn that asks for the denied tools, with Code Mode off", () => {
  let host: Host
  beforeAll(async () => {
    host = await modelHost(false)
  })
  afterAll(() => host?.close())

  test("the model's own calls to the two denied tools never reach Ashby, and neither is offered to it", async () => {
    host.fake.model.script = DENIED_TOOLS.map((tool) => ({ tool: `ashby_${tool}`, arguments: { query: "archive the candidate" } }))
    const before = host.fake.model.requests.length
    const sessionID = (await scripted(host).create({ agent: "build", location: host.location, model: { providerID: "lmstudio", id: MODEL_ID } })).id
    await scripted(host).prompt({ sessionID, text: "Archive the candidate for the backend role and tell Ashby." })
    const turns = () => host.fake.model.requests.slice(before) as { tools?: { function?: { name?: string } }[]; messages?: { role: string }[] }[]
    await until("the model's final turn", async () => turns().some((request) => (request.messages ?? []).filter((message) => message.role === "tool").length >= DENIED_TOOLS.length))
    const offered = turns().flatMap((request) => (request.tools ?? []).map((item) => item.function?.name ?? ""))
    expect(offered.filter((name) => name.startsWith("ashby_"))).toContain("ashby_get_pending_tasks")
    for (const tool of DENIED_TOOLS) {
      expect(offered).not.toContain(`ashby_${tool}`)
      expect(host.fake.calls).not.toContain(tool)
    }
  })
})

describe("a Code Mode turn that asks for the denied tools", () => {
  let host: Host
  beforeAll(async () => {
    host = await modelHost(true)
  })
  afterAll(() => host?.close())

  test("an inner tools.ashby call to a denied tool fails inside the program and never reaches Ashby; a read runs", async () => {
    const code = [
      "const results = []",
      `for (const name of ${JSON.stringify(DENIED_TOOLS)}) {`,
      "  try { await tools.ashby[name]({ query: 'archive the candidate' }); results.push(name + ': ran') } catch (error) { results.push(name + ': refused') }",
      "}",
      "results.push(String((await tools.ashby.get_pending_tasks({})) !== undefined))",
      "return results",
    ].join("\n")
    host.fake.model.script = [{ tool: "execute", arguments: { code } }]
    const before = host.fake.model.requests.length
    const sessionID = (await scripted(host).create({ agent: "build", location: host.location, model: { providerID: "lmstudio", id: MODEL_ID } })).id
    await scripted(host).prompt({ sessionID, text: "Archive the candidate for the backend role and tell Ashby." })
    await until("the model's final turn", async () => host.fake.model.requests.slice(before).some((request) => (request as { messages?: { role: string }[] }).messages?.some((message) => message.role === "tool")))
    expect(host.fake.calls).toContain("get_pending_tasks")
    for (const tool of DENIED_TOOLS) expect(host.fake.calls).not.toContain(tool)
  })
})

describe("the documented opt-in for a denied tool", () => {
  // DP-1's recipe: the ask goes in the agent's own permissions, which come after the plugin's block in that agent.
  const optIn: Rule = { action: "ashby_change_application_stage", resource: "*", effect: "ask" }
  let host: Host
  beforeAll(async () => {
    host = await startHost({ config: () => ({ agents: { build: { permissions: [optIn] } } }) })
  })
  afterAll(() => host?.close())

  test("turns that one tool into a per-call ask in that agent, never an allow, and leaves the rest denied", async () => {
    await ashbyTools(host)
    const rules = (await agentRules(host)).get("build")!
    expect(rules.indexOf(rules.find((rule) => JSON.stringify(rule) === JSON.stringify(optIn))!)).toBeGreaterThan(rules.findIndex((rule) => rule.action === "ashby_change_application_stage" && rule.effect === "deny"))
    expect(await effect(host, "build", "ashby_change_application_stage")).toBe("ask")
    const build = await session(host)
    expect(await attempt(host, build, "build", "change_application_stage")).toEqual({ asked: "ashby_change_application_stage", ok: false, error: "Permission.DeclinedError: " })
    expect(host.fake.calls).not.toContain("change_application_stage")
    // Each call asks again: a "once" answer runs one call and saves nothing.
    expect(await attempt(host, build, "build", "change_application_stage", "once")).toMatchObject({ asked: "ashby_change_application_stage", ok: true })
    expect(await attempt(host, build, "build", "change_application_stage")).toMatchObject({ asked: "ashby_change_application_stage", ok: false })
    // The other agents, Explore included, and the other two tools stay denied.
    for (const id of BUILT_IN.filter((id) => id !== "build")) expect({ id, effect: await effect(host, id, "ashby_change_application_stage") }).toEqual({ id, effect: "deny" })
    for (const tool of DENIED_TOOLS.filter((tool) => tool !== "change_application_stage")) expect(await effect(host, "build", `ashby_${tool}`)).toBe("deny")
  })
})

describe("user permissions", () => {
  const userRules = [allow("add_note_to_candidate"), deny("search_records_by_name")]
  let host: Host
  beforeAll(async () => {
    host = await startHost({
      config: () => ({
        permissions: userRules,
        // The documented fix for a config-only agent: the plugin's block first, then the user's rules again.
        agents: { reviewer: { description: "Reviews changes", mode: "subagent", permissions: [...defaultRules(), ...userRules] } },
      }),
    })
  })
  afterAll(() => host?.close())

  test("P3: a user allow on a write removes the prompt, and a user deny on a read hides it", async () => {
    const build = await session(host)
    expect(await attempt(host, build, "build", "add_note_to_candidate")).toMatchObject({ asked: undefined, ok: true })
    expect(await attempt(host, build, "build", "search_records_by_name")).toEqual({ asked: undefined, ok: false, error: "Tool.Error: Permission denied: ashby_search_records_by_name" })
    expect(hidden((await agentRules(host)).get("build")!, "ashby_search_records_by_name")).toBe(true)
    expect(await attempt(host, build, "build", "shiny_new_tool")).toMatchObject({ asked: "ashby_shiny_new_tool", ok: false })
  })

  test("P5: the per-agent fix guards a config-only agent and keeps the user's rules winning", async () => {
    const reviewer = await session(host, "reviewer")
    expect(await attempt(host, reviewer, "reviewer", "shiny_new_tool")).toMatchObject({ asked: "ashby_shiny_new_tool", ok: false })
    expect(await attempt(host, reviewer, "reviewer", "add_note_to_candidate")).toMatchObject({ asked: undefined, ok: true })
    expect(await attempt(host, reviewer, "reviewer", "search_records_by_name")).toMatchObject({ asked: undefined, ok: false })
    expect(await status(host, reviewer)).toContain("- Agents without default rules: none\n")
  })
})

describe("a user ashby server that points elsewhere", () => {
  let host: Host
  beforeAll(async () => {
    host = await startHost({ config: (url) => ({ mcp: { servers: { ashby: { type: "remote", url: url.replace(/\/mcp$/, "/other"), oauth: false } } } }) })
  })
  afterAll(() => host?.close())

  test("H4: is left in place and reported as a conflict", async () => {
    const text = await status(host, await session(host))
    const other = host.fake.url.replace(/\/mcp$/, "/other")
    expect(text).toContain(`- Connection: conflict (your mcp.servers.ashby points at ${other})`)
    expect(text).toContain(`- Next step: Your OpenCode config defines mcp.servers.ashby with ${other}, but the plugin uses ${host.fake.url}.`)
  })
})

// Ashby's server answers 401 with a bearer challenge until the user signs in, or after its tokens are revoked. On
// the host's own MCP client that is a sign-in, not a failure: status says so, with the /connect step.
describe("a server that asks for a sign-in", () => {
  let host: Host
  beforeAll(async () => {
    // A token without a refresh token, as Ashby issues when the authorization request lacks prompt=consent: a 401 then
    // needs a new sign-in and keeps the credential, which is the account /connect marks.
    host = await startHost({ oauth: true, fake: { refreshTokens: false } })
  })
  afterAll(() => host?.close())

  /** The /connect entry's connections, with the status a credential shows there. */
  const connections = async () => {
    const { data: servers } = await host.client.mcp.list({ location: host.location })
    const integrationID = servers.find((item) => item.name === "ashby")?.integrationID
    if (!integrationID) return []
    const { data } = await host.client.integration.get({ integrationID, location: host.location })
    return (data as unknown as { connections?: { status?: { status: string; message?: string } }[] }).connections ?? []
  }

  /** Signs in through OpenCode's own flow: it registers, the authorization endpoint redirects the loopback callback, and the token endpoint exchanges the code. */
  const signIn = async () => {
    const { data: servers } = await host.client.mcp.list({ location: host.location })
    const integrationID = servers.find((item) => item.name === "ashby")!.integrationID!
    const { data: integration } = await host.client.integration.get({ integrationID, location: host.location })
    const oauth = (host.client.integration as unknown as { oauth: Record<"connect", (input: object) => Promise<{ data: { attemptID: string; url: string } }>> }).oauth
    const { data: attempt } = await oauth.connect({ integrationID, methodID: (integration.methods as { id: string }[])[0]!.id, location: host.location })
    const redirect = await fetch(attempt.url, { redirect: "manual" })
    const callback = redirect.headers.get("location")
    expect(callback).toMatch(/^http:\/\/127\.0\.0\.1:\d+\//)
    await fetch(callback!)
  }

  test("is sign-in required, with the /connect next step, in the RPC and in /ashby-status", async () => {
    await ashbyTools(host)
    expect(await statusRpc(host)).toMatchObject({ state: "connected" })
    // A real sign-in leaves a credential: the account /connect marks when Ashby stops accepting it.
    host.fake.challenge = true
    await signIn()
    await until("the sign-in stores a token", async () => host.fake.tokens.length === 1)
    expect(host.fake.tokens[0]).toMatchObject({ grant_type: "authorization_code" })
    expect(host.fake.tokens[0]).not.toHaveProperty("refresh_token")
    host.fake.challenge = false
    await until("the server is connected after the sign-in", async () => {
      const { data } = await host.client.mcp.list({ location: host.location })
      return data.find((item) => item.name === "ashby")?.status.status === "connected"
    })
    expect(await until("/connect shows the account", async () => (await connections()).find((item) => item.status?.message === undefined && (item as { type?: string }).type === "credential")))
    // The tokens stop working: the next connection gets the challenge.
    host.fake.challenge = true
    const mcp = host.client.mcp as unknown as Record<"connect" | "disconnect", (input: object) => Promise<unknown>>
    await mcp.disconnect({ server: "ashby", location: host.location })
    await mcp.connect({ server: "ashby", location: host.location }).catch(() => {})
    const server = await until("the server needs a sign-in", async () => {
      const { data } = await host.client.mcp.list({ location: host.location })
      const found = data.find((item) => item.name === "ashby")
      return found?.status.status === "needs_auth" ? found : undefined
    })
    expect(server.status.status).toBe("needs_auth")
    // The plugin marks the /connect account, so the person sees which one to choose there.
    expect(await until("/connect shows the new sign-in on the account", async () => (await connections()).find((item) => item.status?.message === SIGN_IN_AGAIN)))
    expect(await statusRpc(host)).toMatchObject({ state: "sign_in_required", nextStep: SIGN_IN })
    const text = await status(host, await session(host))
    expect(text).toContain(`- Connection: sign-in required (${host.fake.url}, registered by this plugin)`)
    expect(text).toContain(`- Next step: ${SIGN_IN}`)
    expect(text).not.toMatch(/authorize|code_challenge/)
    // The same account connects again once Ashby answers: the mark is the plugin's, and it clears its own.
    host.fake.challenge = false
    await mcp.connect({ server: "ashby", location: host.location })
    await until("the server is connected again", async () => {
      const { data } = await host.client.mcp.list({ location: host.location })
      return data.find((item) => item.name === "ashby")?.status.status === "connected"
    })
    expect(await until("/connect clears the sign-in mark", async () => ((await connections()).some((item) => item.status?.message) ? undefined : true))).toBe(true)
  })
})

// The plugin registers the server with no oauth block. The sign-in OpenCode starts must still ask Ashby for a refresh
// token: the scopes come from Ashby's challenge, offline_access included, in the client registration and in the
// authorization request.
describe("the sign-in OpenCode starts", () => {
  let host: Host
  beforeAll(async () => {
    host = await startHost({ oauth: true })
  })
  afterAll(() => host?.close())

  test("registers a client dynamically and asks for openid mcp offline_access, from Ashby's challenge alone", async () => {
    await ashbyTools(host)
    host.fake.challenge = true
    const { data: servers } = await host.client.mcp.list({ location: host.location })
    const integrationID = servers.find((item) => item.name === "ashby")?.integrationID
    expect(integrationID).toBeDefined()
    const { data: integration } = await host.client.integration.get({ integrationID: integrationID!, location: host.location })
    const methodID = (integration.methods as { id: string }[])[0]!.id
    const oauth = (host.client.integration as unknown as { oauth: Record<"connect" | "cancel", (input: object) => Promise<{ data: { attemptID: string; url: string } }>> }).oauth
    const { data: attempt } = await oauth.connect({ integrationID, methodID, location: host.location })
    try {
      const url = new URL(attempt.url)
      expect(`${url.origin}${url.pathname}`).toBe(`${host.fake.origin}/oidc/auth`)
      expect(url.searchParams.get("scope")).toBe(ASHBY_SCOPES)
      expect(url.searchParams.get("code_challenge_method")).toBe("S256")
      expect(url.searchParams.get("client_id")).toBe("fake-client-1")
      expect(url.searchParams.get("redirect_uri")).toMatch(/^http:\/\/127\.0\.0\.1:\d+\//)
      expect(host.fake.registrations).toHaveLength(1)
      expect(host.fake.registrations[0]).toMatchObject({
        client_name: "opencode",
        scope: ASHBY_SCOPES,
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
      })
    } finally {
      await oauth.cancel({ integrationID, attemptID: attempt.attemptID, location: host.location }).catch(() => {})
    }
  })
})

describe("the /connect entry", () => {
  let host: Host
  beforeAll(async () => {
    host = await startHost({ oauth: true })
  })
  afterAll(() => host?.close())

  const entry = async () => {
    const { data } = await host.client.mcp.list({ location: host.location })
    const integrationID = data.find((server) => server.name === "ashby")?.integrationID
    if (!integrationID) return undefined
    return (await host.client.integration.get({ integrationID, location: host.location })).data
  }

  test("is named Ashby, also after the host reloads its MCP servers", async () => {
    expect((await until("the entry is named Ashby", async () => ((await entry())?.name === "Ashby" ? entry() : undefined)))?.methods).toHaveLength(1)
    await host.probe().mcp.reload()
    await until("the entry is named Ashby again after the reload", async () => (await entry())?.name === "Ashby")
    await Bun.sleep(1000)
    expect((await entry())?.name).toBe("Ashby")
  })
})

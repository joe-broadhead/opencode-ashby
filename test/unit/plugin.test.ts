import { afterAll, describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { Plugin } from "@opencode/plugin"
import { ENDPOINT, NAMESPACE_DESCRIPTION } from "../../src/constants.js"
import ashby from "../../src/index.js"
import { conflictUrl, createAshbyPlugin, displayUrl, registerServer, serverConfig } from "../../src/plugin.js"
import { SKILL_NAMES } from "../../src/skills.js"
import type { ServerSource } from "../../src/status.js"
import { agentEditor, builtInAgents, mcpEditor, transforms, type McpEditor } from "./fake.js"

const skillsDir = mkdtempSync(join(tmpdir(), "ashby-skills-"))
afterAll(() => rmSync(skillsDir, { recursive: true, force: true }))
for (const name of SKILL_NAMES) {
  mkdirSync(join(skillsDir, name))
  writeFileSync(join(skillsDir, name, "SKILL.md"), `---\nname: ${name}\ndescription: Use Ashby.\n---\nBody.\n`)
}
const seam = { endpoint: ENDPOINT, skillsDir }
const KEY = "sk-fake-0123456789"

async function register(initial: Parameters<typeof mcpEditor>[0] = {}) {
  const { transform, run } = transforms<McpEditor>()
  const records: [ServerSource | undefined, string | undefined][] = []
  await registerServer({ transform }, serverConfig(seam), (source, problem) => records.push([source, problem]))
  const { editor, servers } = mcpEditor(initial)
  run(editor)
  return { servers, records }
}

describe("the ashby server", () => {
  test("is Ashby's server with no oauth block, so OpenCode requests the scopes Ashby names; no OAuth only for a loopback test", () => {
    expect(serverConfig(seam)).toEqual({ type: "remote", url: "https://mcp.ashbyhq.com/mcp/v1" })
    expect(Object.hasOwn(serverConfig(seam), "oauth")).toBe(false)
    expect(serverConfig({ endpoint: "http://127.0.0.1:1/mcp", oauth: false })).toEqual({ type: "remote", url: "http://127.0.0.1:1/mcp", oauth: false })
  })

  test("is registered under the stable name when the user has none", async () => {
    const { servers, records } = await register({ github: { type: "remote", url: "https://example.com/mcp" } })
    expect(servers.get("ashby")).toEqual(serverConfig(seam))
    expect(servers.get("github")).toEqual({ type: "remote", url: "https://example.com/mcp" })
    expect(records).toEqual([[{ type: "plugin", url: "https://mcp.ashbyhq.com/mcp/v1", signIn: "oauth" }, undefined]])
  })

  test("adopts the user's own server at Ashby's URL unchanged, with OAuth settings or with its own headers", async () => {
    const own = { type: "remote" as const, url: "https://mcp.ashbyhq.com/mcp/v1/", oauth: { client_id: "pre-registered", callback_port: 19876 }, timeout: { execution: 60_000 } }
    const { servers, records } = await register({ ashby: own })
    expect(servers.get("ashby")).toEqual(own)
    expect(records).toEqual([[{ type: "adopted", url: "https://mcp.ashbyhq.com/mcp/v1", signIn: "oauth" }, undefined]])
    const keyed = { type: "remote" as const, url: ENDPOINT, oauth: false as const, headers: { Authorization: `Bearer ${KEY}` } }
    const withKey = await register({ ashby: keyed })
    expect(withKey.servers.get("ashby")).toEqual(keyed)
    expect(withKey.records).toEqual([[{ type: "adopted", url: "https://mcp.ashbyhq.com/mcp/v1", signIn: "own" }, undefined]])
    // The plugin never copies the entry's headers anywhere it reports.
    expect(JSON.stringify(withKey.records)).not.toContain(KEY)
  })

  test("reports a server that points elsewhere, or a local command, as a conflict and adds nothing", async () => {
    const foreign = { type: "remote" as const, url: "https://ashby-mcp.example.com/mcp?token=secret" }
    const { servers, records } = await register({ ashby: foreign })
    expect([...servers]).toEqual([["ashby", foreign]])
    expect(records).toEqual([[{ type: "conflict", url: "https://ashby-mcp.example.com/…", expected: "https://mcp.ashbyhq.com/mcp/v1" }, undefined]])
    const local = await register({ ashby: { type: "local", command: ["ashby-mcp"] } })
    expect(local.records).toEqual([[{ type: "conflict", url: "a local command", expected: "https://mcp.ashbyhq.com/mcp/v1" }, undefined]])
  })

  test("never throws from the transform", async () => {
    const { transform, run } = transforms<McpEditor>()
    const records: [ServerSource | undefined, string | undefined][] = []
    await registerServer({ transform }, serverConfig(seam), (source, problem) => records.push([source, problem]))
    const { editor } = mcpEditor()
    expect(() => run({ ...editor, get: () => { throw new Error("broken editor") } })).not.toThrow()
    expect(records).toEqual([[undefined, "SERVER_NOT_REGISTERED: The ashby MCP server could not be registered (broken editor). Next step: Restart OpenCode."]])
  })

  test("display URLs drop credentials, queries and trailing slashes", () => {
    expect(displayUrl("https://user:pass@mcp.ashbyhq.com/mcp/v1/?key=1#x")).toBe("https://mcp.ashbyhq.com/mcp/v1")
    expect(displayUrl("not a url")).toBe("an invalid URL")
  })

  // DR-3: another server's path may hold a secret, so only its origin is shown; Ashby's own origin keeps its path, so a
  // wrong path there is visible. The status example in docs/configuration.md is this function's output.
  test("a conflict shows another origin alone, and Ashby's own origin with its path", () => {
    expect(conflictUrl("https://ashby-mcp.example.com/mcp?token=secret-path-123", ENDPOINT)).toBe("https://ashby-mcp.example.com/…")
    expect(conflictUrl("https://hooks.example.com", ENDPOINT)).toBe("https://hooks.example.com")
    expect(conflictUrl("https://mcp.ashbyhq.com/mcp/v2?token=secret-path-123#x", ENDPOINT)).toBe("https://mcp.ashbyhq.com/mcp/v2")
    expect(conflictUrl("https://alice:hunter2@mcp.ashbyhq.com/mcp/v2", ENDPOINT)).toBe("https://mcp.ashbyhq.com/mcp/v2")
    expect(conflictUrl("not a url", ENDPOINT)).toBe("an invalid URL")
    // The guide's Next step example is what the first line builds.
    expect(`Your OpenCode config defines mcp.servers.ashby with ${conflictUrl("https://ashby-mcp.example.com/mcp", ENDPOINT)}, but the plugin uses ${ENDPOINT}.`).toContain("with https://ashby-mcp.example.com/…")
  })
})

type SetupContext = Pick<Plugin.Context, "app" | "options" | "mcp" | "agent" | "skill" | "command" | "session" | "tool" | "integration" | "rpc" | "permission" | "location" | "event">

/** A context with only what setup touches. Each transform is collected so the test can replay it. */
function context(options: unknown, version = "2.2.3") {
  const mcp = transforms<McpEditor>()
  const agent = transforms<Parameters<Parameters<Plugin.Context["agent"]["transform"]>[0]>[0]>()
  const skill = transforms<Parameters<Parameters<Plugin.Context["skill"]["transform"]>[0]>[0]>()
  const command = transforms<Parameters<Parameters<Plugin.Context["command"]["transform"]>[0]>[0]>()
  const tool = transforms<Parameters<Parameters<Plugin.Context["tool"]["transform"]>[0]>[0]>()
  const rpc: string[] = []
  const handlers = new Map<string, Record<string, (input: unknown, context: unknown) => Promise<unknown>>>()
  const hooks: string[] = []
  const ctx = {
    app: { name: "opencode", version, channel: "latest" },
    options: options as Plugin.Context["options"],
    mcp: { transform: mcp.transform, list: async () => ({ data: [{ name: "ashby", status: { status: "connected" } }] }) },
    skill: { transform: skill.transform, list: async () => ({ data: [] }) },
    command: { transform: command.transform },
    rpc: {
      register: async (definition: { id: string }, methods: Record<string, (input: unknown, context: unknown) => Promise<unknown>>) => {
        rpc.push(definition.id)
        handlers.set(definition.id, methods)
        return { dispose: async () => void rpc.splice(rpc.indexOf(definition.id), 1) }
      },
    },
    // A session whose agent allows everything, and one Ashby read that answers "ok".
    session: { get: async () => ({ id: "ses_test", agent: "build", location: { directory: "/projects/ashby-test" }, permissions: [] }) },
    agent: { transform: agent.transform, list: async () => ({ data: [] }), get: async () => ({ data: { id: "build", permissions: [{ action: "*", resource: "*", effect: "allow" }] } }) },
    tool: {
      transform: tool.transform,
      list: async () => [{ id: "ashby_search_records_by_name", execute: async () => ({ content: [{ type: "text", text: "ok" }] }) }],
      hook: async (name: string) => (hooks.push(`tool:${name}`), { dispose: async () => void hooks.splice(hooks.indexOf(`tool:${name}`), 1) }),
    },
    location: { directory: "/projects/ashby-test" },
    permission: { hook: async (name: string) => (hooks.push(name), { dispose: async () => void hooks.splice(hooks.indexOf(name), 1) }) },
    event: { subscribe: ({ signal }: { signal: AbortSignal }) => ({ [Symbol.asyncIterator]: () => ({ next: () => new Promise((resolve) => signal.addEventListener("abort", () => resolve({ done: true, value: undefined }))) }) }) },
  } as unknown as SetupContext
  return { ctx: ctx as Plugin.Context, mcp, agent, skill, command, tool, rpc, handlers, hooks }
}

describe("setup", () => {
  test("the package default export is the plugin with its stable ID", () => {
    expect(ashby.id).toBe("ashby.recruiting")
    expect(typeof ashby.setup).toBe("function")
  })

  test("registers the server, the rules, the skills, the status command, its RPC and the tools RPC", async () => {
    const { ctx, mcp, agent, skill, command, tool, rpc, hooks } = context({})
    const cleanup = await createAshbyPlugin(seam).setup(ctx)
    const { editor, servers } = mcpEditor()
    mcp.run(editor)
    expect(servers.get("ashby")).toEqual(serverConfig(seam))
    const agents = builtInAgents()
    agent.run(agentEditor(agents))
    expect(agents.every((item) => item.permissions[1]?.action === "ashby_*")).toBe(true)
    const skills: string[] = []
    skill.run({ add: (info: { id: string }) => skills.push(info.id) } as never)
    expect(skills).toEqual([...SKILL_NAMES])
    const commands: string[] = []
    command.run({ add: (definition: { name: string }) => commands.push(definition.name) })
    expect(commands).toEqual(["ashby-status"])
    // Code Mode's catalog describes the ashby namespace; the plugin adds no tool of its own.
    const namespaces: { name: string; description?: string }[] = []
    const tools: unknown[] = []
    tool.run({ namespace: (namespace: { name: string; description?: string }) => void namespaces.push(namespace), add: (info: unknown) => void tools.push(info) } as never)
    expect(namespaces).toEqual([{ name: "ashby", description: NAMESPACE_DESCRIPTION }])
    expect(tools).toEqual([])
    // The always-visible rules: read the skill, Metaview's part, no ranking, whose a change may reach, what `access`
    // does, untrusted text.
    for (const words of [
      "Read the ashby skill before the first call",
      "Interview recordings and transcripts are Metaview's when it is connected; the pipeline, applications, jobs and records are Ashby's",
      "Label Ashby's AI output as Ashby's",
      "personal data",
      "untrusted text",
      "decline in one sentence",
      "Never search mail",
      "load ashby-write and say in your reply what it does and whom it reaches",
      "Moving or archiving a candidate (change_application_stage) can email the candidate",
      "submit_mcp_feedback sends text to Ashby's team",
      "Never rank candidates or recommend a hire or no-hire, even when asked.",
      "Every tool is allowed by default, so a change runs without a prompt",
    ]) {
      expect(NAMESPACE_DESCRIPTION).toContain(words)
    }
    expect(NAMESPACE_DESCRIPTION).not.toContain(ENDPOINT)
    expect(rpc).toEqual(["ashby.recruiting", "ashby.recruiting.tools"])
    // The tools RPC's one evaluate hook, and no tool hook: Ashby has no result to capture.
    expect(hooks.sort()).toEqual(["evaluate"])
    expect(typeof cleanup).toBe("function")
    await cleanup!()
    expect(rpc).toEqual(["ashby.recruiting"])
    expect(hooks).toEqual([])
  })

  test.each([
    ["registers its own server", {}, { value: { text: "ok" } }],
    ["adopts the user's server at Ashby's URL", { ashby: { type: "remote", url: ENDPOINT, oauth: false, headers: { Authorization: `Bearer ${KEY}` } } }, { value: { text: "ok" } }],
    ["finds a user server at another URL", { ashby: { type: "remote", url: "https://ashby-mcp.example.com/mcp" } }, { code: "SERVER_CONFLICT" }],
  ] as const)("the tools RPC runs a read when the plugin %s, or refuses with its code", async (_, initial, expected) => {
    const { ctx, mcp, handlers } = context({})
    const cleanup = await createAshbyPlugin(seam).setup(ctx)
    mcp.run(mcpEditor(initial as Parameters<typeof mcpEditor>[0]).editor)
    const rpcContext = { signal: new AbortController().signal, error: (_type: string, _message: string, data: { code: string }) => ({ code: data.code }) }
    const result = await handlers.get("ashby.recruiting.tools")!.search_records_by_name!({ sessionID: "ses_test", input: { name: "Example Candidate" } }, rpcContext)
    expect("code" in (result as object) ? result : { value: result }).toEqual(expected)
    expect(JSON.stringify(result)).not.toContain(KEY)
    await cleanup!()
  })

  test("a server that could not be registered is not called a conflict, and a conflicting server gets no namespace text", async () => {
    const rpcContext = { signal: new AbortController().signal, error: (_type: string, _message: string, data: { code: string }) => ({ code: data.code }) }
    // The mcp transform throws: the tools RPC reports the server's state, not SERVER_CONFLICT.
    const broken = context({})
    const stopBroken = await createAshbyPlugin(seam).setup(broken.ctx)
    broken.mcp.run({ get: () => { throw new Error("broken editor") } } as never)
    const result = await broken.handlers.get("ashby.recruiting.tools")!.search_records_by_name!({ sessionID: "ses_test", input: { name: "Example Candidate" } }, rpcContext)
    expect(result).not.toEqual({ code: "SERVER_CONFLICT" })
    await stopBroken!()
    // A server at another URL is not Ashby's: Code Mode keeps its own description of it.
    const foreign = context({})
    const stopForeign = await createAshbyPlugin(seam).setup(foreign.ctx)
    foreign.mcp.run(mcpEditor({ ashby: { type: "remote", url: "https://ashby-mcp.example.com/mcp" } }).editor)
    const namespaces: unknown[] = []
    foreign.tool.run({ namespace: (namespace: unknown) => void namespaces.push(namespace), add: () => {} } as never)
    expect(namespaces).toEqual([])
    await stopForeign!()
  })

  test("refuses invalid options and untested hosts before registering anything", async () => {
    const invalid = context({ apiKey: KEY })
    await expect(createAshbyPlugin(seam).setup(invalid.ctx)).rejects.toThrow("OPTIONS_INVALID")
    const untested = context({}, "0.0.0-dev-1")
    await expect(createAshbyPlugin(seam).setup(untested.ctx)).rejects.toThrow("HOST_UNTESTED")
    for (const item of [invalid, untested]) expect([item.mcp, item.agent, item.skill, item.command, item.tool].map((t) => t.callbacks.length)).toEqual([0, 0, 0, 0, 0])
    for (const item of [invalid, untested]) expect([item.rpc, item.hooks]).toEqual([[], []])
  })

  test("a host outside the range runs with the override, and an untested release inside the range runs without it", async () => {
    for (const [options, version] of [[{ allowUntestedHost: true }, "2.3.0"], [{}, "2.2.99"]] as const) {
      const { ctx, mcp } = context(options, version)
      const cleanup = await createAshbyPlugin(seam).setup(ctx)
      expect(mcp.callbacks).toHaveLength(1)
      await cleanup!()
    }
  })
})

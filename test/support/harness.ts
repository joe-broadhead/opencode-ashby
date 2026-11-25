/**
 * A faithful fake of the OpenCode host, for the plugin's own tests.
 *
 * The real code runs: `assertHost`, `registerAccounts`, the provider, `createHandlers`, `register` (doors 1–3) and the
 * one `execute.after` hook. Only OpenCode is faked: `ctx.mcp`, `ctx.tool.list()`, `ctx.integration.connection.active`,
 * the agent rules and the RPC registration. The fake MCP transport answers the way Ashby's server does — the recorded
 * `list_interviews` envelope, its request/answer shape, and its own `Tool.Error` for a rate limit, a provider failure
 * or a permission refusal — so a test never fakes the plugin's own code.
 */
import { evaluate, type PermissionRule, toolAction } from "@we-the-rebel-alliance/plugin-contract/access"
import { accountName, registerAccounts } from "@we-the-rebel-alliance/plugin-contract/accounts"
import type { Manifest } from "@we-the-rebel-alliance/plugin-contract/manifest"
import { assertHost, register } from "@we-the-rebel-alliance/plugin-contract/register"
import { installChangedHook } from "../../src/bus.ts"
import { createHandlers } from "../../src/handlers/index.ts"
import { manifest as installed } from "../../src/manifest.ts"
import { createProvider, serverConfig } from "../../src/provider/index.ts"

/** One interview as Ashby's `list_interviews` answers it: the shape the reader was written against. */
export interface InterviewRecord {
  readonly interviewEventId: string
  readonly interviewTitle?: string
  readonly jobTitle?: string
  readonly startTime: string
  readonly status?: string
  readonly candidate?: { readonly id?: string; readonly name?: string; readonly email?: string; readonly phone?: string }
  readonly interviewers?: readonly { readonly id?: string; readonly name?: string; readonly email?: string }[]
  readonly url?: string
  readonly feedback?: string
  readonly transcript?: string
}

/** How a fake account's `list_interviews` fails, when it does. */
export type Failure = "rate-limit" | "unavailable" | "permission" | "empty" | "text"

/** One alias's fake server and its answer. */
export interface HarnessAccount {
  /** The host's server state; `missing` means `registerAccounts` set it but the host does not list it. */
  readonly status?: "connected" | "pending" | "disabled" | "failed" | "needs_auth" | "missing" | undefined
  readonly reason?: string | undefined
  /** The active sign-in; `null` means the server has no credential. */
  readonly credential?: { readonly id: string; readonly label: string } | null | undefined
  readonly interviews?: readonly InterviewRecord[] | undefined
  /** Extra vendor tools the server lists beyond `list_interviews`. */
  readonly tools?: readonly string[] | undefined
  /** `false` makes a connected server list no `list_interviews` at all. */
  readonly listTool?: boolean | undefined
  /** Replace `list_interviews`' answer for the found interviews. */
  readonly answer?: ((found: readonly InterviewRecord[], input: Readonly<Record<string, unknown>>) => unknown) | undefined
  readonly fail?: Failure | undefined
  /** The message a `text` answer carries, or a failure's own line. */
  readonly message?: string | undefined
  /** How many interviews one `list_interviews` call returns; more than that is marked truncated. */
  readonly cap?: number | undefined
}

export interface HarnessOptions {
  readonly accounts?: Readonly<Record<string, HarnessAccount>> | undefined
  readonly options?: Readonly<Record<string, unknown>> | undefined
  readonly now?: number | undefined
  readonly manifest?: Manifest | undefined
  /** A second agent whose own `* allow` comes after the generated rules, so status names it. */
  readonly looseAgent?: boolean | undefined
  /** Make `ctx.agent.list()` throw, so status's unguarded-agent read is unknown. */
  readonly agentListThrows?: boolean | undefined
}

/** One recorded call the fake MCP server received. */
export interface RecordedCall {
  readonly alias: string
  readonly tool: string
  /** The request id the fake MCP transport assigned this call; an error's line carries it, as a support ticket would. */
  readonly request: string
  readonly input: Readonly<Record<string, unknown>>
}

/** What `callTool` answers: the door's value, or its refusal code and message. */
export type CallAnswer = { readonly ok: true; readonly output: unknown } | { readonly ok: false; readonly code: string; readonly message: string }

/** A tool `register` added, as the fake editor captured it. */
interface CapturedTool {
  readonly name: string
  execute(
    input: unknown,
    context: {
      readonly sessionID: string
      readonly agent: string
      readonly messageID: string
      readonly id: string
      readonly signal: AbortSignal
      readonly progress: (update?: Readonly<Record<string, unknown>>) => Promise<void>
    },
  ): Promise<{ readonly output: unknown; readonly content: string }>
}

export interface Harness {
  readonly manifest: Manifest
  readonly tools: readonly CapturedTool[]
  readonly emitted: readonly { readonly event: string; readonly data: unknown }[]
  readonly calls: readonly RecordedCall[]
  callTool(method: string, input: unknown, options?: { readonly signal?: AbortSignal }): Promise<CallAnswer>
  fireToolHook(event: Record<string, unknown>): Promise<void>
  callsOf(alias: string): readonly RecordedCall[]
  dispose(): Promise<void>
}

const toolError = (message: string, cause?: Error): Error => {
  const error = new Error(message) as Error & { _tag?: string; error?: unknown }
  error._tag = "Tool.Error"
  if (cause !== undefined) error.error = cause
  return error
}

const iso = (value: unknown): string => new Date(Date.parse(String(value))).toISOString()

/** The recorded envelope around `found`, echoing the window asked for. */
export function envelope(found: readonly InterviewRecord[], input: Readonly<Record<string, unknown>>, extra: Record<string, unknown> = {}): unknown {
  return {
    data: {
      interviews: found,
      returnedCount: found.length,
      truncated: false,
      onOrAfterDate: iso(input["onOrAfterDate"]),
      onOrBeforeDate: iso(input["onOrBeforeDate"]),
      message: found.length === 0 ? "No interviews found." : `Found ${found.length} interviews.`,
      ...extra,
    },
  }
}

/** Start the plugin against the fake host. */
export async function startHarness(options: HarnessOptions = {}): Promise<Harness> {
  const manifest = options.manifest ?? installed
  const entries = Object.entries(options.accounts ?? { work: {}, personal: {} })
  const pluginOptions: Record<string, unknown> = options.options ?? { access: "all", accounts: Object.fromEntries(entries.map(([alias]) => [alias, {}])) }
  const fixedNow = options.now ?? Date.now()

  const accounts = new Map<string, HarnessAccount>(entries)
  const servers: { name: string; alias: string; state: NonNullable<HarnessAccount["status"]>; reason?: string; integrationID: string; config: unknown }[] = []
  const credentials = new Map<string, { id: string; label: string }>()
  const calls: RecordedCall[] = []
  const emitted: { event: string; data: unknown }[] = []
  let requests = 0
  const requestId = (tool: string) => {
    requests += 1
    return `req_ashby_${String(requests).padStart(4, "0")}_${tool}`
  }
  const hookCallbacks: ((event: Record<string, unknown>) => Promise<void> | void)[] = []
  const agents: { id: string; permissions: PermissionRule[] }[] = [
    { id: "build", permissions: [{ action: "*", resource: "*", effect: "allow" }] },
    { id: "plan", permissions: [{ action: "*", resource: "*", effect: "allow" }] },
    ...(options.looseAgent === true
      ? [
          {
            id: "loose",
            permissions: [{ action: "*", resource: "*", effect: "allow" } as PermissionRule, { action: "*", resource: "*", effect: "allow" } as PermissionRule],
          },
        ]
      : []),
  ]
  const sessions = new Map<string, { agent: string; permissions: readonly PermissionRule[] }>()
  const tools: CapturedTool[] = []
  let disposed = false

  const accountOf = (alias: string): HarnessAccount => accounts.get(alias) ?? {}

  const serverOf = (name: string) => servers.find((server) => server.name === name)

  const answerFor = (alias: string, request: string, input: Readonly<Record<string, unknown>>): { readonly output?: unknown; readonly content?: unknown } => {
    const account = accountOf(alias)
    if (account.fail === "empty") return {}
    if (account.fail === "text") return { content: [{ type: "text", text: account.message ?? "" }] }
    if (account.fail === "rate-limit")
      throw toolError(account.message ?? `Rate limit exceeded: too many requests, try again in 60 seconds (request ${request})`)
    if (account.fail === "unavailable") throw toolError(account.message ?? `Ashby had an internal error (request ${request})`)
    if (account.fail === "permission") throw toolError(account.message ?? `Permission denied for this Ashby account (request ${request})`, new Error("blocked"))
    const from = Date.parse(String(input["onOrAfterDate"]))
    const to = Date.parse(String(input["onOrBeforeDate"]))
    const found = (account.interviews ?? []).filter((interview) => {
      const at = Date.parse(interview.startTime)
      return at >= from && at <= to
    })
    const cap = account.cap ?? found.length
    const listed = found.slice(0, cap)
    if (account.answer !== undefined) return { output: account.answer(listed, input) }
    return { output: envelope(listed, input, { truncated: found.length > listed.length }) }
  }

  const allTools = () => {
    const list: { id: string; server: string; alias: string; tool: string }[] = []
    for (const server of servers) {
      if (server.state !== "connected") continue
      const account = accountOf(server.alias)
      for (const tool of [...(account.listTool === false ? [] : ["list_interviews"]), ...(account.tools ?? [])]) {
        list.push({ id: toolAction(server.name, tool), server: server.name, alias: server.alias, tool })
      }
    }
    return list
  }

  const context: any = {
    app: { version: "2.4.1" },
    options: pluginOptions,
    mcp: {
      async list() {
        return {
          data: servers
            .filter((server) => server.state !== "missing")
            .map((server) => ({
              name: server.name,
              status: server.state === "failed" ? { status: "failed", error: server.reason ?? "connection failed" } : { status: server.state },
              integrationID: server.integrationID,
            })),
        }
      },
      async transform(callback: (editor: unknown) => void) {
        callback({
          list: () => servers.map((server) => [server.name, server.config] as const),
          get: (name: string) => serverOf(name)?.config,
          set: (name: string, config: unknown) => {
            const alias = [...accounts.keys()].find((candidate) => accountName(manifest.plugin.name, candidate) === name) ?? "default"
            const held = accountOf(alias)
            const state = held.status ?? "connected"
            const record = { name, alias, state, config, integrationID: name, ...(held.reason === undefined ? {} : { reason: held.reason }) }
            const index = servers.findIndex((server) => server.name === name)
            if (index === -1) servers.push(record)
            else servers[index] = record
            if (state !== "missing") {
              credentials.set(
                name,
                held.credential === null
                  ? { id: "", label: "" }
                  : (held.credential ?? { id: `cred-${alias}`, label: alias === "default" ? "Ashby sign-in" : `Ashby (${alias})` }),
              )
            }
          },
          update: () => undefined,
          remove: () => undefined,
        })
        return { async dispose() {} }
      },
    },
    integration: {
      connection: {
        async active(integrationID: string) {
          const server = servers.find((entry) => entry.integrationID === integrationID)
          if (server === undefined) return undefined
          const held = credentials.get(server.name)
          if (held === undefined || held.id === "") return undefined
          return { type: "credential" as const, id: held.id, label: held.label, method: "oauth" as const }
        },
      },
    },
    tool: {
      async list() {
        return allTools().map((entry) => ({
          id: entry.id,
          name: entry.tool,
          description: `${entry.tool} on ${entry.server}`,
          input: { type: "object", additionalProperties: true },
          execute: async (input: unknown) => {
            const request = requestId(entry.tool)
            calls.push({ alias: entry.alias, tool: entry.tool, request, input: (input ?? {}) as Record<string, unknown> })
            if (entry.tool === "list_interviews") return answerFor(entry.alias, request, (input ?? {}) as Record<string, unknown>)
            return { output: { tool: entry.tool, request, input } }
          },
        }))
      },
      async transform(callback: (editor: unknown) => void) {
        callback({
          namespace: () => undefined,
          add: (tool: CapturedTool) => {
            tools.push(tool)
          },
          list: () => tools,
          get: (id: string) => tools.find((tool) => tool.name === id),
          update: () => undefined,
          remove: () => undefined,
        })
        return { async dispose() {} }
      },
      async hook(name: string, callback: (event: Record<string, unknown>) => Promise<void> | void) {
        if (name === "execute.after") hookCallbacks.push(callback)
        return { async dispose() {} }
      },
    },
    agent: {
      async transform(callback: (editor: unknown) => void) {
        callback({
          list: () => agents,
          update: (id: string, update: (agent: { permissions: PermissionRule[] }) => void) => {
            const agent = agents.find((entry) => entry.id === id)
            if (agent !== undefined) update(agent)
          },
        })
        return { async dispose() {} }
      },
      async list() {
        if (options.agentListThrows === true) throw new Error("the host could not read the agent list")
        return { data: agents }
      },
      async get({ agentID }: { agentID: string }) {
        const agent = agents.find((entry) => entry.id === agentID)
        if (agent === undefined) throw new Error(`no agent ${agentID}`)
        return { data: agent }
      },
    },
    permission: {
      async assert(input: { sessionID: string; agent?: string; action: string }) {
        const session = sessions.get(input.sessionID)
        const rules = [...(agents.find((entry) => entry.id === input.agent)?.permissions ?? []), ...(session?.permissions ?? [])]
        const effect = evaluate(rules, input.action, "*")
        if (effect === "deny") throw Object.assign(new Error(`Permission.BlockedError: ${input.action}`), { _tag: "Permission.BlockedError" })
        if (effect === "ask") throw Object.assign(new Error(`Permission.DeclinedError: ${input.action}`), { _tag: "Permission.DeclinedError" })
      },
      async hook() {
        return { async dispose() {} }
      },
      async list() {
        return []
      },
      async reply() {},
    },
    session: {
      async get({ sessionID }: { sessionID: string }) {
        return sessions.get(sessionID) ?? { agent: "build", permissions: [] }
      },
    },
    rpc: {
      async register(definition: { id: string; methods: Record<string, unknown>; events: Record<string, unknown> }) {
        void definition
        return {
          events: {
            async emit(event: string, data: unknown) {
              emitted.push({ event, data })
            },
          },
          async dispose() {},
        }
      },
    },
  }

  sessions.set("ses_test", { agent: "build", permissions: [] })
  assertHost(context, manifest)
  const registered = await registerAccounts(context, { manifest, options: pluginOptions, server: () => serverConfig() })
  const provider = createProvider(context)
  const handlers = createHandlers({
    manifest,
    options: pluginOptions,
    provider,
    context,
    version: "0.0.0",
    hostVersion: context.app.version,
    accountProblems: registered.problems,
    now: () => fixedNow,
  })
  const registration = await register(context, manifest, handlers)
  const hook = await installChangedHook(
    context,
    manifest,
    registered.accounts.map((account) => account.alias),
    registration.bus,
  )

  return {
    manifest,
    tools,
    emitted,
    calls,
    async callTool(method, input, callOptions = {}) {
      const tool = tools.find((entry) => entry.name === method)
      if (tool === undefined) throw new Error(`the harness has no tool ${method}`)
      try {
        const result = await tool.execute(input, {
          sessionID: "ses_test",
          agent: "build",
          messageID: "msg_test",
          id: `call_${method}`,
          signal: callOptions.signal ?? new AbortController().signal,
          progress: async () => {},
        })
        return { ok: true, output: result.output }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        const code = /^([A-Z][A-Z0-9_]*): /.exec(message)?.[1] ?? "UNAVAILABLE"
        return { ok: false, code, message }
      }
    },
    async fireToolHook(event) {
      for (const callback of hookCallbacks) await callback(event)
    },
    callsOf(alias) {
      return calls.filter((call) => call.alias === alias)
    },
    async dispose() {
      if (disposed) return
      disposed = true
      await hook.dispose()
      await registration.dispose()
    },
  }
}

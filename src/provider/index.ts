/**
 * The provider client: the one place the vendor endpoint is named, and the only code that reaches Ashby.
 *
 * The credentials and the transport are OpenCode's. Every Ashby call goes through OpenCode's own MCP tool executor for
 * the alias's server (`ctx.tool.list()` finds it, `execute` runs it), so the host sends the account's credential and
 * applies the alias's own permission rule. This module derives the server and tool names with the contract's
 * `accountName` and `toolAction`, refuses fast when the server is missing or needs a sign-in, reads a structured answer
 * or JSON text, and maps an MCP failure to one contract code on one redacted line.
 *
 * `list_interviews` is the plugin's one direct Ashby read. `owner` reads OpenCode's sign-in for the alias's server and
 * calls Ashby for nothing: Ashby has no tool that names the signed-in user.
 */
import type { Plugin } from "@opencode/plugin"
import { toolAction } from "@we-the-rebel-alliance/plugin-contract/access"
import { redactReason } from "@we-the-rebel-alliance/plugin-contract/accounts"
import { RegisterError, refusal } from "@we-the-rebel-alliance/plugin-contract/register"
import { type HostContext, type ServerRecord, serverRecord } from "../accounts.ts"
import { LIST_TOOL } from "./interviews.ts"

/** Ashby's MCP server: the one endpoint this package names. */
export const ENDPOINT = "https://mcp.ashbyhq.com/mcp/v1"

/**
 * The vendor MCP server config one alias gets. The endpoint is the same for every alias; OpenCode keys the OAuth
 * credential by server name, so `ashby` and `ashby-work` hold separate sign-ins. No `oauth` block: Ashby's challenge
 * names its own scopes.
 */
export function serverConfig(): Record<string, unknown> {
  return { type: "remote", url: ENDPOINT, oauth: {} }
}

/** What a provider call needs from the method call: whose account, and the call it runs under. */
export interface ProviderCall {
  readonly account: string
  readonly signal: AbortSignal
  readonly sessionID: string
  readonly agent: string
  readonly messageID: string
  readonly id: string
  readonly progress: (update?: Readonly<Record<string, unknown>>) => Promise<void>
}

/** The signed-in owner of one alias: OpenCode's credential, which Ashby does not confirm. */
export interface Owner {
  readonly id: string
  readonly label: string
  readonly verified: false
}

/** The part of the plugin context the provider uses. */
export interface ProviderContext extends HostContext {
  readonly tool: Pick<Plugin.Context["tool"], "list">
  readonly integration: { readonly connection: Pick<Plugin.Context["integration"]["connection"], "active"> }
}

export interface Provider {
  /** OpenCode's sign-in for the alias's server. It reads no Ashby content. */
  owner(account: string): Promise<Owner>
  /** One `list_interviews` answer, as Ashby sent it: the caller reads it, never trusts it as content. */
  listInterviews(call: ProviderCall, input: Readonly<Record<string, unknown>>): Promise<unknown>
}

const SIGN_IN_NEXT = "Sign in to that account's Ashby server, then call probe."

/** One display line: control characters become spaces and runs of whitespace collapse. */
const oneLine = (text: string): string =>
  [...text]
    .map((char) => (char.charCodeAt(0) < 0x20 || char.charCodeAt(0) === 0x7f ? " " : char))
    .join("")
    .replace(/\s+/g, " ")
    .trim()
const RETRY_NEXT = "Try again; if it keeps failing, call status."

/** The refusal a server state gives: a needed sign-in is its own code, every other state is unavailable now. */
function stateRefusal(record: ServerRecord): never {
  if (record.state === "needs_auth") throw new RegisterError(refusal("NEEDS_SIGN_IN", `the ${record.name} server needs a sign-in`, SIGN_IN_NEXT))
  const reason = record.state === "failed" && record.reason !== undefined ? `: ${redactReason(record.reason)}` : ""
  const what =
    record.state === "missing"
      ? `the ${record.name} server is not registered`
      : record.state === "disabled"
        ? `the ${record.name} server is disabled`
        : record.state === "pending"
          ? `the ${record.name} server is still connecting`
          : `the ${record.name} server could not connect${reason}`
  throw new RegisterError(
    refusal("UNAVAILABLE", what, record.state === "missing" || record.state === "disabled" ? "Check the plugin's status and restart OpenCode." : RETRY_NEXT),
  )
}

/** The alias's server when it can answer now; a server that will not connect is refused, never awaited. */
async function connected(context: ProviderContext, account: string): Promise<ServerRecord> {
  const record = await serverRecord(context, account)
  if (record.state !== "connected") stateRefusal(record)
  return record
}

/** The alias's server for a probe: only a missing server or a needed sign-in stops it, since a probe reads no content. */
async function probeServer(context: ProviderContext, account: string): Promise<ServerRecord> {
  const record = await serverRecord(context, account)
  if (record.state === "missing" || record.state === "needs_auth") stateRefusal(record)
  return record
}

const recordOf = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value)

/** A tool result's data: its structured output, its text parsed as JSON, or the text itself. Nothing when it is empty. */
export function resultData(result: { readonly output?: unknown; readonly content?: unknown }): unknown {
  if (recordOf(result.output)) return result.output
  const body =
    typeof result.output === "string"
      ? result.output
      : typeof result.content === "string"
        ? result.content
        : Array.isArray(result.content)
          ? result.content.flatMap((part) => (recordOf(part) && part["type"] === "text" && typeof part["text"] === "string" ? [part["text"]] : [])).join("\n")
          : ""
  if (body.trim() === "") return undefined
  try {
    return JSON.parse(body) as unknown
  } catch {
    return body
  }
}

/**
 * An MCP failure as one contract refusal. A `Tool.Error` with a cause is the host refusing the call (a person's rule or
 * a declined ask), so it is `PERMISSION_DENIED`; one without a cause is Ashby's own error, `RATE_LIMITED` for its rate
 * limit and `UNAVAILABLE` otherwise. The line is redacted and cut, so no credential or query value reaches the caller.
 */
function refusalFor(error: unknown, server: string, tool: string, signal: AbortSignal): never {
  if (signal.aborted) throw error
  const held = recordOf(error) ? error : {}
  const raw = error instanceof Error ? error.message : typeof error === "string" ? error : String(error)
  const line = redactReason(raw.split(/\r?\n/, 1)[0] ?? raw)
  if (held["_tag"] === "Tool.Error" && held["error"] !== undefined) {
    throw new RegisterError(refusal("PERMISSION_DENIED", `${tool} was refused: ${line}`, "Ask the person to allow it, or use an account whose rules allow it."))
  }
  if (line.startsWith(`MCP server "${server}"`)) throw new RegisterError(refusal("UNAVAILABLE", `the ${server} server is not connected`, RETRY_NEXT))
  if (/rate.?limit|too many requests|\b429\b/i.test(raw)) {
    throw new RegisterError(
      refusal("RATE_LIMITED", `Ashby's ${tool} hit Ashby's rate limit: ${line}`, "Wait a minute, then call events_list again with the same cursor."),
    )
  }
  throw new RegisterError(refusal("UNAVAILABLE", `Ashby's ${tool} failed: ${line}`, RETRY_NEXT))
}

/** The executor context OpenCode's MCP tool expects, from the method call that is running. */
const toolContext = (call: ProviderCall) =>
  ({
    sessionID: call.sessionID,
    agent: call.agent,
    messageID: call.messageID,
    id: call.id,
    signal: call.signal,
    progress: call.progress,
  }) as never

/** The plugin's provider, over the host's MCP servers and tools. */
export function createProvider(context: ProviderContext): Provider {
  return {
    async owner(account) {
      const record = await probeServer(context, account)
      const integrationID = record.integrationID
      if (integrationID === undefined) throw new RegisterError(refusal("NEEDS_SIGN_IN", `the ${record.name} server has no signed-in account`, SIGN_IN_NEXT))
      const connection = await context.integration.connection.active(integrationID).catch(() => undefined)
      if (connection?.type !== "credential")
        throw new RegisterError(refusal("NEEDS_SIGN_IN", `the ${record.name} server has no signed-in account`, SIGN_IN_NEXT))
      const id = String(connection.id).trim()
      if (id === "") throw new RegisterError(refusal("NEEDS_SIGN_IN", `the ${record.name} server's sign-in carries no id`, SIGN_IN_NEXT))
      const label = oneLine(String(connection.label ?? "")).slice(0, 200)
      return { id: `ashby:credential:${encodeURIComponent(id)}`, label: label || "Ashby sign-in", verified: false }
    },

    async listInterviews(call, input) {
      const server = await connected(context, call.account)
      const action = toolAction(server.name, LIST_TOOL)
      const tool = (await context.tool.list()).find((entry) => entry.id === action)
      if (tool === undefined) {
        throw new RegisterError(refusal("UNAVAILABLE", `the ${server.name} server lists no ${LIST_TOOL}`, RETRY_NEXT))
      }
      call.signal.throwIfAborted()
      let result: Awaited<ReturnType<typeof tool.execute>>
      try {
        result = await tool.execute(input as never, toolContext(call))
      } catch (error) {
        refusalFor(error, server.name, LIST_TOOL, call.signal)
      }
      const data = resultData(result)
      if (data === undefined) throw new RegisterError(refusal("UNAVAILABLE", `Ashby's ${LIST_TOOL} answered nothing`, RETRY_NEXT))
      return data
    },
  }
}

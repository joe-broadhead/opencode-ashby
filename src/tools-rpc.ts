/**
 * Ashby's part of the tools RPC (`ashby.recruiting.tools`): the plugin value and the method table that the source
 * contract's `tools-rpc` module takes. The module (`@we-the-rebel-alliance/source-contract/tools-rpc`, bundled into
 * `dist/index.js`) is the transport every plugin of the family shares:
 *
 *   POST /api/rpc/ashby.recruiting.tools/<method>
 *   { "input": { "sessionID": "<session>", "input": <the tool's input> } }
 *
 * A script runs as a session and the agent it names; the rule for the method's permission action is resolved before
 * dispatch, and only `allow` runs. An MCP method then runs through OpenCode's own executor, which checks
 * `ashby_<tool>` against the same rules and sends OpenCode's own credential; `events_list` and `probe`, the interviews
 * source's two methods (src/events.ts), run their own specs. `docs/scripting.md` describes the calls.
 */
import type { Failure, McpResult, MethodSpec, NextSteps, ShapeCall, ToolsRpcPlugin } from "@we-the-rebel-alliance/source-contract/tools-rpc"
import { toolsRpcId } from "@we-the-rebel-alliance/source-contract/tools-rpc"
import { DESTRUCTIVE_TOOLS, READ_TOOLS, WRITE_TOOLS } from "./ashby-tools.js"
import { PLUGIN_ID, SERVER_NAME } from "./constants.js"
import { EventsFailure } from "./events.js"

/** The RPC's id: the plugin's id and `.tools`, `ashby.recruiting.tools`. Scripts call it by name, so it never changes. */
export const TOOLS_RPC_ID = toolsRpcId(PLUGIN_ID)

/**
 * Every known Ashby tool, by exact name, from the plugin's one table: the reads, the writes, and the destructive class.
 * A tool Ashby adds later is never a method until it is classified in `src/ashby-tools.ts`; `describe` lists it as
 * unclassified. The class never decides whether a call runs: the rules do. The plugin's own two methods, `events_list`
 * and `probe`, are added beside these where the plugin starts, because they need its context.
 */
export const METHODS: readonly MethodSpec[] = [
  ...READ_TOOLS.map((name): MethodSpec => ({ kind: "mcp", name, class: "read" })),
  ...WRITE_TOOLS.map((name): MethodSpec => ({ kind: "mcp", name, class: "write" })),
  ...DESTRUCTIVE_TOOLS.map((name): MethodSpec => ({ kind: "mcp", name, class: "destructive" })),
]

/** What the model path's `execute.before` hooks do to an MCP call's arguments. Ashby has no such hook. */
export function shapeInput(_method: string, input: unknown, _call: ShapeCall): unknown {
  return input
}

/** What the model path's `execute.after` hooks do to a result, which the executor skips. Ashby has no such hook. */
export function shapeResult(_method: string, result: McpResult, _call: ShapeCall): McpResult {
  return result
}

/** The next step for each code. Each is one sentence that ends with a full stop. */
export const NEXT_STEPS: NextSteps = {
  SESSION_UNKNOWN: `Create a session in the location you mean, such as POST /api/session with {"agent":"build"} sent with the header "x-opencode-directory: <dir>" or the location[directory] query, and pass its id.`,
  SESSION_AGENT_REQUIRED: `Create a session that names an agent this project has, with its project as the location, such as POST /api/session with {"agent":"build","location":{"directory":"/path/to/project"}}, and pass its id.`,
  PERMISSION_DENIED: "Add an allow rule for the tool to the session's agent or to the session, or use a session whose agent allows it.",
  SERVER_CONFLICT: `Run /ashby-status, then point your own mcp.servers.${SERVER_NAME} in opencode.json at the URL it names or remove it, and restart OpenCode.`,
  AUTH_REQUIRED: `Run /connect and choose Ashby, then press o or Enter to open the link (in a terminal, opencode mcp auth ${SERVER_NAME} opens it automatically in this project's folder; if it answers MCP server not found: ${SERVER_NAME}, wait a few seconds and run it again).`,
  CONNECTING: "Wait a few seconds, then call the method again.",
  CONNECTION_FAILED: "Check your network, then run /ashby-status and follow its next step.",
  DISABLED: `Enable the ${SERVER_NAME} server in /mcps, or remove "disabled": true from mcp.servers.${SERVER_NAME} in opencode.json.`,
  NOT_REGISTERED: "Run /ashby-status and follow its next step.",
  TOOL_UNAVAILABLE: "Call describe to see which methods OpenCode lists now, and run /ashby-status.",
  UPSTREAM_ERROR: "Check the input against the method's schema from describe; if Ashby reports a rate limit, wait a minute and make fewer calls at once.",
  CANCELLED: "Call the method again if you still need the result.",
}

/** The plugin's own errors, thrown by plugin-owned specs, as a code, what happened and the next step: the source's. */
export function pluginError(error: unknown): Failure | undefined {
  return error instanceof EventsFailure ? { code: error.code, what: error.what, next: error.next } : undefined
}

/** Ashby's plugin value for the tools RPC. */
export const PLUGIN: ToolsRpcPlugin = { id: PLUGIN_ID, nextSteps: NEXT_STEPS, shapeInput, shapeResult, pluginError }

/**
 * The one nudge (`contract §10`): `changed` after a completed pass-through write.
 *
 * A write goes straight to Ashby's own tool, so the plugin never sees it in a handler. The one place it can see it is
 * the tool result: this `execute.after` hook looks up the effective tool id OpenCode ran, and when it is one of this
 * plugin's non-read `mcp:` tools for an alias, emits `changed` on the registration's bus. The hook adds no text to the
 * model's turn and changes no result: a tool-result hook is observation only. It is the plugin's only bus wiring.
 *
 * Only `completed` calls nudge. An errored or refused call changed nothing, so an app's next pull is already the truth.
 */
import type { Plugin } from "@opencode/plugin"
import { toolAction } from "@we-the-rebel-alliance/plugin-contract/access"
import type { Bus } from "@we-the-rebel-alliance/plugin-contract/bus"
import type { Manifest } from "@we-the-rebel-alliance/plugin-contract/manifest"
import { serverName } from "./accounts.ts"

/** The hook's registration, which setup disposes with the rest. */
export interface Hook {
  dispose(): Promise<void>
}

/** The part of the plugin context the hook uses. */
export interface HookContext {
  readonly tool: Pick<Plugin.Context["tool"], "hook">
}

/** One completed pass-through write, by the effective tool id OpenCode used. */
interface ChangedTool {
  readonly alias: string
  readonly method: string
}

/**
 * Every non-read `mcp:<tool>` row for every alias, keyed by the effective OpenCode tool id
 * (`<server>_<normalised tool>`). The same derivations the access rules use, so a nudge and a permission can never name
 * different tools.
 */
export function changedTools(manifest: Manifest, aliases: readonly string[]): Map<string, ChangedTool> {
  const declared = aliases.length === 0 ? ["default"] : aliases
  const rows = Object.entries(manifest.methods).filter(([method, item]) => method.startsWith("mcp:") && item.class !== "read")
  const tools = new Map<string, ChangedTool>()
  for (const alias of declared) {
    for (const [method] of rows) tools.set(toolAction(serverName(alias), method.slice("mcp:".length)), { alias, method })
  }
  return tools
}

/**
 * Install the one `execute.after` hook. A completed non-read `mcp:` tool for an alias emits
 * `changed { capability, account, reason: "write" }`; a read, an errored call, another plugin's tool or a tool of no
 * alias emits nothing.
 */
export async function installChangedHook(context: HookContext, manifest: Manifest, aliases: readonly string[], bus: Bus): Promise<Hook> {
  const capability = manifest.sources[0]?.id
  if (capability === undefined) return { async dispose() {} }
  const tools = changedTools(manifest, aliases)
  return context.tool.hook("execute.after", async (event) => {
    if (event.status !== "completed") return
    const id = typeof event.tool === "string" && event.tool !== "" ? event.tool : event.info?.options?.permission
    if (typeof id !== "string") return
    const hit = tools.get(id)
    if (hit === undefined) return
    await bus.emit("changed", { capability, account: hit.alias, reason: "write" })
  })
}

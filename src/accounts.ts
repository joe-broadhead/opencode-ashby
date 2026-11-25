/**
 * Accounts (`contract §5`): the plugin's one name, the per-alias vendor MCP server, and the host state of that server.
 *
 * The credentials live in Ashby's MCP server: one server per alias, named `<name>` for `default` and
 * `<name>-<alias>` otherwise. `accountName` in the contract's `accounts` module is the one derivation of that name;
 * this module never builds it by hand. Sign-in is OpenCode's own OAuth per server, so the plugin holds nothing.
 *
 * `serverState` reads the host's record only. It never calls Ashby, so `status` can report every alias without a
 * provider read, and setup's status stays cheap.
 */
import type { Plugin } from "@opencode/plugin"
import { accountName } from "@we-the-rebel-alliance/plugin-contract/accounts"

/** The plugin's name: its tool namespace, RPC id, permission prefix and the root of every server name. */
export const PLUGIN = "ashby"

/** The one integration or MCP server one alias signs in to: `ashby` for `default`, `ashby-work` for `work`. */
export function serverName(alias: string): string {
  return accountName(PLUGIN, alias)
}

/** The host's view of one alias's server: the five MCP states, plus `missing` for one that is not registered. */
export type ServerState = "connected" | "pending" | "disabled" | "failed" | "needs_auth" | "missing"

/** One alias's MCP server as OpenCode lists it now. `reason` is the host's own failure text, never shown unredacted. */
export interface ServerRecord {
  readonly name: string
  readonly state: ServerState
  readonly reason?: string
  /** The integration that holds this server's OAuth credential, when the host gives one. */
  readonly integrationID?: string
}

/** The part of the plugin context that lists MCP servers. */
export interface HostContext {
  readonly mcp: Pick<Plugin.Context["mcp"], "list">
}

/**
 * The alias's server, as the host lists it. A server the plugin did not register is `missing`, never an empty
 * connection: status says so and a provider call refuses before it starts.
 */
export async function serverRecord(context: HostContext, alias: string): Promise<ServerRecord> {
  const name = serverName(alias)
  const server = (await context.mcp.list()).data.find((entry) => entry.name === name)
  if (server === undefined) return { name, state: "missing" }
  const state = server.status.status
  return {
    name,
    state,
    ...(state === "failed" ? { reason: server.status.error } : {}),
    ...(server.integrationID === undefined ? {} : { integrationID: server.integrationID }),
  }
}

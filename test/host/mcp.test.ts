/**
 * The built bundle's MCP servers on the real OpenCode 2.4.1 host, in an empty project.
 *
 * An `mcp`-mechanism plugin registers one MCP server per account: `ashby` for the default alias, `ashby-<alias>`
 * otherwise. This run points the host at an empty temporary project, and at an empty HOME so no user or project
 * configuration can add a server, then asks the host's own MCP list. The options are injected by wrapping the loaded
 * plugin definition's `setup`, as the kit's `createHost` does; the rest of the context is the real host. The server
 * may be `pending` or `needs_auth`, because no Ashby account is signed in here: what this proves is the registration.
 */
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { Plugin } from "@opencode/plugin"
import { waitForActivation } from "@we-the-rebel-alliance/plugin-contract/kit"
import { afterAll, beforeAll, describe, expect, test } from "vitest"

const HOME_KEYS = ["HOME", "XDG_CONFIG_HOME", "XDG_CACHE_HOME", "XDG_DATA_HOME", "XDG_STATE_HOME"] as const
type HomeKey = (typeof HOME_KEYS)[number]

/** The host's own answer, structurally: the SDK's client type leaves these domains untyped here. */
interface ListedServer {
  readonly name: string
  readonly status: { readonly status: string }
}
interface ListedPlugin {
  readonly id?: string | undefined
  readonly state: { readonly status: string }
}

let home = ""
const previous = new Map<HomeKey, string | undefined>()

beforeAll(async () => {
  home = await mkdtemp(join(tmpdir(), "ashby-mcp-home-"))
  for (const key of HOME_KEYS) previous.set(key, process.env[key])
  process.env["HOME"] = home
  process.env["XDG_CONFIG_HOME"] = join(home, "config")
  process.env["XDG_CACHE_HOME"] = join(home, "cache")
  process.env["XDG_DATA_HOME"] = join(home, "data")
  process.env["XDG_STATE_HOME"] = join(home, "state")
})

afterAll(async () => {
  for (const key of HOME_KEYS) {
    const value = previous.get(key)
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  await rm(home, { recursive: true, force: true })
})

/** Starts the real host on a fresh empty project with these plugin options, and returns its MCP server names. */
const serverNames = async (options: Record<string, unknown>): Promise<string[]> => {
  const project = await mkdtemp(join(tmpdir(), "ashby-mcp-project-"))
  const { OpenCode } = await import("@opencode/sdk")
  const loaded = (await import(new URL("../../dist/index.js", import.meta.url).href)) as { readonly default: Plugin.Plugin }
  const plugin: Plugin.Plugin = {
    id: loaded.default.id,
    setup(context) {
      return loaded.default.setup(
        new Proxy(context, {
          get(target, property) {
            if (property === "options") return options
            return Reflect.get(target, property)
          },
        }),
      )
    },
  }
  const host = await OpenCode.create({
    plugins: [plugin],
    config: { directory: project },
    app: { name: "opencode", version: "2.4.1" },
    log: { level: "error", emit: () => undefined },
  })
  try {
    const session = await host.sessions.create({ location: { directory: project }, agent: "build", permissions: [] })
    await host.sessions.prompt({ sessionID: session.id, text: "activate the mcp test", delivery: "queue" }).catch(() => undefined)
    await waitForActivation({
      isActive: async () => {
        const list = (await host.plugin.list({ location: { directory: project } })) as { readonly data: readonly ListedPlugin[] }
        return list.data.some((entry) => entry.id === "ashby" && entry.state.status === "active")
      },
      timeoutMs: 30_000,
    })
    const listed = (await host.mcp.list({ location: { directory: project } })) as { readonly data: readonly ListedServer[] }
    return listed.data.map((server) => server.name).sort()
  } finally {
    await host.close()
    await rm(project, { recursive: true, force: true })
  }
}

describe("the built plugin's MCP servers on OpenCode 2.4.1", () => {
  test("registers the default account's server as ashby in an empty project", async () => {
    expect(await serverNames({})).toContain("ashby")
  }, 60_000)

  test("registers one ashby-<alias> server per configured account, and no default", async () => {
    const names = await serverNames({ accounts: { work: {}, personal: {} } })
    expect(names).toContain("ashby-work")
    expect(names).toContain("ashby-personal")
    expect(names).not.toContain("ashby")
  }, 60_000)
})

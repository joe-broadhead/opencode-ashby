/**
 * The built bundle's skills on the real OpenCode 2.4.1 host, in an empty project.
 *
 * OpenCode discovers a project's own `skills/` folder by itself, so running the host in this repository would list the
 * skills even if the plugin never registered them. This run points the host at an empty temporary project, and at an
 * empty HOME so no user skill can shadow one, then asks the host's own skill list. Every `skills/<id>/SKILL.md` must be
 * there under this package's path, with the description its YAML frontmatter declares: parsing a block scalar the way
 * YAML does is the difference between registering `>` and registering its text.
 */
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import type { Plugin } from "@opencode/plugin"
import { load, resolve } from "@opencode/plugin/host"
import { waitForActivation } from "@we-the-rebel-alliance/plugin-contract/kit"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { parse as parseYaml } from "yaml"

const root = fileURLToPath(new URL("../..", import.meta.url))
const HOME_KEYS = ["HOME", "XDG_CONFIG_HOME", "XDG_CACHE_HOME", "XDG_DATA_HOME", "XDG_STATE_HOME"] as const
type HomeKey = (typeof HOME_KEYS)[number]

/** The host's own answer, structurally: the SDK's client type leaves these domains untyped here. */
interface ListedSkill {
  readonly id: string
  readonly name: string
  readonly description?: string | undefined
  readonly path: string
  readonly content: string
}
interface ListedPlugin {
  readonly id?: string | undefined
  readonly state: { readonly status: string }
}

let home = ""
const previous = new Map<HomeKey, string | undefined>()

beforeAll(async () => {
  home = await mkdtemp(join(tmpdir(), "ashby-home-"))
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

describe("the built plugin's skills on OpenCode 2.4.1", () => {
  test("registers every skills/<id>/SKILL.md after load, with its YAML description", async () => {
    const entry = resolve({ directory: root }).server
    expect(entry).toBeDefined()
    const module = (await load(entry!)) as { readonly default?: Plugin.Plugin }
    const definition = module.default
    expect(definition).toBeDefined()

    const ids = (await readdir(join(root, "skills"), { withFileTypes: true }))
      .filter((directory) => directory.isDirectory())
      .map((directory) => directory.name)
      .sort()
    expect(ids.length).toBeGreaterThan(0)

    const project = await mkdtemp(join(tmpdir(), "ashby-project-"))
    const { OpenCode } = await import("@opencode/sdk")
    const host = await OpenCode.create({
      plugins: [definition!],
      config: { directory: project },
      app: { name: "opencode", version: "2.4.1" },
      log: { level: "error", emit: () => undefined },
    })
    try {
      const session = await host.sessions.create({ location: { directory: project }, agent: "build", permissions: [] })
      await host.sessions.prompt({ sessionID: session.id, text: "activate the skills test", delivery: "queue" }).catch(() => undefined)
      await waitForActivation({
        isActive: async () => {
          const list = (await host.plugin.list({ location: { directory: project } })) as { readonly data: readonly ListedPlugin[] }
          return list.data.some((plugin) => plugin.id === definition!.id && plugin.state.status === "active")
        },
        timeoutMs: 30_000,
      })
      const listed = (await host.skill.list({ location: { directory: project } })) as { readonly data: readonly ListedSkill[] }
      for (const id of ids) {
        const skill = listed.data.find((candidate) => candidate.id === id)
        expect(skill, `the host did not register the ${id} skill`).toBeDefined()
        expect(skill?.name).toBe(id)
        expect(skill?.path).toBe(join(root, "skills", id, "SKILL.md"))
        expect(skill?.content.trim()).not.toBe("")

        const text = await readFile(join(root, "skills", id, "SKILL.md"), "utf8")
        const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text)
        expect(frontmatter, `the ${id} skill has no frontmatter`).not.toBeNull()
        const parsed = parseYaml(frontmatter![1] ?? "") as { readonly description?: unknown }
        expect(typeof parsed.description, `the ${id} skill has no YAML description`).toBe("string")
        const expected = parsed.description as string
        expect(expected.trim(), `the ${id} skill has an empty description`).not.toBe("")
        for (const marker of [">", "|", ">-", "|-", ">+", "|+"]) {
          expect(expected.trim(), `the ${id} skill registers the block marker ${marker}, not its text`).not.toBe(marker)
        }
        expect(skill?.description, `the ${id} skill description is not the YAML text`).toBe(expected)
      }
    } finally {
      await host.close()
      await rm(project, { recursive: true, force: true })
    }
  }, 60_000)
})

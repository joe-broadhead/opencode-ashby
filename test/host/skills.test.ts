/**
 * The built bundle on the real OpenCode 2.4.1 host, in an empty project.
 *
 * OpenCode discovers a project's own `skills/` folder by itself, so running the host in this repository would list the
 * skills even if the plugin never registered them. This run points the host at an empty temporary project, and at an
 * empty HOME so no user skill can shadow one, then asks the host's own skill list. Every `skills/<id>/SKILL.md` must be
 * there under this package's path: that is the proof that `ctx.skill.transform` ran at setup.
 */
import { cp, mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import type { Plugin } from "@opencode/plugin"
import { waitForActivation } from "@we-the-rebel-alliance/plugin-contract/kit"
import { afterAll, beforeAll, describe, expect, test } from "vitest"

const root = fileURLToPath(new URL("../..", import.meta.url))
const skillsDir = join(root, "skills")
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
let project = ""
const previous = new Map<HomeKey, string | undefined>()
let bundled: string[] = []

beforeAll(async () => {
  bundled = (await readdir(skillsDir, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
  home = await mkdtemp(join(tmpdir(), "ashby-home-"))
  project = await mkdtemp(join(tmpdir(), "ashby-project-"))
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
  await rm(project, { recursive: true, force: true })
})

describe("the built plugin's skills on OpenCode 2.4.1", () => {
  test("registers every skills/*/SKILL.md in an empty project", async () => {
    const { OpenCode } = await import("@opencode/sdk")
    const loaded = (await import(new URL("../../dist/index.js", import.meta.url).href)) as { readonly default: Plugin.Plugin }
    const host = await OpenCode.create({
      plugins: [loaded.default],
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
          return list.data.some((entry) => entry.id === "ashby" && entry.state.status === "active")
        },
        timeoutMs: 30_000,
      })
      const listed = (await host.skill.list({ location: { directory: project } })) as { readonly data: readonly ListedSkill[] }
      const own = listed.data
        .filter((skill) => skill.path.startsWith(`${skillsDir}/`))
        .map((skill) => skill.id)
        .sort()
      expect(bundled.length).toBeGreaterThan(0)
      expect(own).toEqual(bundled)
      for (const id of bundled) {
        const skill = listed.data.find((entry) => entry.id === id)
        expect(skill?.path).toBe(join(skillsDir, id, "SKILL.md"))
        expect(skill?.name).toBe(id)
        expect(skill?.description?.trim()).not.toBe("")
        expect(skill?.content.trim()).not.toBe("")
      }
    } finally {
      await host.close()
    }
  }, 60_000)

  test("still loads with a missing or broken skill and reports SKILLS_INVALID in status", async () => {
    const pkg = await mkdtemp(join(root, "test", ".broken-skills-"))
    const brokenProject = await mkdtemp(join(tmpdir(), "ashby-broken-project-"))
    const brokenSkills = join(pkg, "skills")
    try {
      await mkdir(join(pkg, "dist"), { recursive: true })
      await cp(join(root, "dist", "index.js"), join(pkg, "dist", "index.js"))
      await cp(join(root, "package.json"), join(pkg, "package.json"))
      await mkdir(join(brokenSkills, "ok"), { recursive: true })
      await writeFile(join(brokenSkills, "ok", "SKILL.md"), "---\nname: ok\ndescription: Use ok.\n---\n\nThe body.\n")
      await mkdir(join(brokenSkills, "missing"), { recursive: true })
      await mkdir(join(brokenSkills, "broken"), { recursive: true })
      await writeFile(join(brokenSkills, "broken", "SKILL.md"), "---\nname: wrong\ndescription: Use broken.\n---\n\nThe body.\n")

      const { OpenCode } = await import("@opencode/sdk")
      const loaded = (await import(pathToFileURL(join(pkg, "dist", "index.js")).href)) as { readonly default: Plugin.Plugin }
      const host = await OpenCode.create({
        plugins: [loaded.default],
        config: { directory: brokenProject },
        app: { name: "opencode", version: "2.4.1" },
        log: { level: "error", emit: () => undefined },
      })
      try {
        const session = await host.sessions.create({ location: { directory: brokenProject }, agent: "build", permissions: [] })
        await host.sessions.prompt({ sessionID: session.id, text: "activate the broken-skills test", delivery: "queue" }).catch(() => undefined)
        await waitForActivation({
          isActive: async () => {
            const list = (await host.plugin.list({ location: { directory: brokenProject } })) as { readonly data: readonly ListedPlugin[] }
            return list.data.some((entry) => entry.id === "ashby" && entry.state.status === "active")
          },
          timeoutMs: 30_000,
        })
        const listed = (await host.skill.list({ location: { directory: brokenProject } })) as { readonly data: readonly ListedSkill[] }
        const own = listed.data
          .filter((skill) => skill.path.startsWith(`${brokenSkills}/`))
          .map((skill) => skill.id)
          .sort()
        expect(own).toEqual(["ok"])
        const answer = await host.rpc.call({
          rpcID: "ashby",
          method: "status",
          input: { sessionID: session.id, input: {} },
          location: { directory: brokenProject },
        })
        const status = answer?.output as { readonly state?: string; readonly nextStep?: string } | undefined
        expect(status?.state).toBe("error")
        expect(String(status?.nextStep)).toContain("SKILLS_INVALID")
      } finally {
        await host.close()
      }
    } finally {
      await rm(pkg, { recursive: true, force: true })
      await rm(brokenProject, { recursive: true, force: true })
    }
  }, 60_000)
})

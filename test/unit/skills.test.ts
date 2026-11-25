import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { statusAnswer } from "@we-the-rebel-alliance/plugin-contract/accounts"
import { describe, expect, test } from "vitest"
import { manifest } from "../../src/manifest.ts"
import { loadSkills, parseSkill, registerSkills } from "../../src/skills.ts"

const skill = (name: string, description: string, body: string) => `---\nname: ${name}\ndescription: ${description}\n---\n\n${body}\n`
const path = (name: string) => `/tmp/skills/${name}/SKILL.md`

describe("parseSkill", () => {
  test("reads the name, description and body of a valid skill", () => {
    const parsed = parseSkill("ashby", path("ashby"), skill("ashby", "Use Ashby.", "The body."))
    expect(parsed.id).toBe("ashby")
    expect(parsed.name).toBe("ashby")
    expect(parsed.description).toBe("Use Ashby.")
    expect(parsed.path).toBe(path("ashby"))
    expect(parsed.content).toBe("The body.")
  })

  test("refuses a name that is not its directory", () => {
    expect(() => parseSkill("ashby", path("ashby"), skill("other", "Use Ashby.", "The body."))).toThrow(/must be named "ashby"/)
  })

  test("refuses a missing description", () => {
    expect(() => parseSkill("ashby", path("ashby"), "---\nname: ashby\n---\n\nThe body.")).toThrow(/has no description/)
  })

  test("refuses an empty body", () => {
    expect(() => parseSkill("ashby", path("ashby"), "---\nname: ashby\ndescription: Use Ashby.\n---\n\n")).toThrow(/has an empty body/)
  })
})

describe("a broken skill", () => {
  test("leaves the plugin started, registers the valid skills and reports SKILLS_INVALID in status", async () => {
    const directory = await mkdtemp(join(tmpdir(), "ashby-skills-"))
    try {
      await mkdir(join(directory, "ok"), { recursive: true })
      await writeFile(join(directory, "ok", "SKILL.md"), skill("ok", "Use ok.", "The body."))
      await mkdir(join(directory, "missing"), { recursive: true })
      await mkdir(join(directory, "broken"), { recursive: true })
      await writeFile(join(directory, "broken", "SKILL.md"), skill("wrong", "Use broken.", "The body."))

      const { skills, problems } = await loadSkills(directory)
      expect(skills.map((loaded) => loaded.id)).toEqual(["ok"])
      expect(problems).toHaveLength(2)
      expect(problems.every((problem) => problem.startsWith("SKILLS_INVALID:"))).toBe(true)

      // The setup path continues: the valid skill is registered and the transform answers a disposer.
      const added: string[] = []
      const editor = {
        list: () => [],
        get: () => undefined,
        add: (loaded: { readonly id: string }) => {
          added.push(String(loaded.id))
        },
        update: () => undefined,
        remove: () => undefined,
      }
      const registration = await registerSkills(
        {
          transform: (async (callback: (value: typeof editor) => void) => {
            callback(editor)
            return { async dispose() {} }
          }) as never,
        },
        skills,
      )
      await registration.dispose()
      expect(added).toEqual(["ok"])

      const answer = statusAnswer({
        manifest,
        version: "0.0.0",
        hostVersion: "2.4.1",
        accounts: [],
        problems,
        unguardedAgents: { ok: true, agents: [] },
      })
      expect(answer.state).toBe("error")
      expect(String(answer.nextStep)).toContain("SKILLS_INVALID")
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})

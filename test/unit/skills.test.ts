import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import type { Plugin } from "@opencode/plugin"
import { describe, expect, test } from "vitest"
import { readSkills, registerSkills } from "../../src/skills.ts"

const root = fileURLToPath(new URL("../..", import.meta.url))

/** A temporary `skills/` directory holding one file per entry. */
function fixture(files: Readonly<Record<string, string>>): string {
  const directory = mkdtempSync(join(tmpdir(), "ashby-skills-"))
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(join(directory, name), { recursive: true })
    writeFileSync(join(directory, name, "SKILL.md"), text)
  }
  return directory
}

describe("readSkills", () => {
  test("reads the plugin's own skills, with their names, descriptions and bodies", () => {
    const skills = readSkills()
    expect(skills.map((skill) => skill.id)).toEqual(["ashby", "ashby-write"])

    const ashby = skills[0]
    expect(ashby?.name).toBe("ashby")
    expect(ashby?.description).toBe(
      "The user's Ashby candidates, pipeline, interviews, feedback and tasks: find a record, count a pipeline, prepare for an interview, read AI screening. Not for changes: load ashby-write.",
    )
    expect(ashby?.content.startsWith("# Ashby\n")).toBe(true)
    expect(ashby?.content.includes("---")).toBe(false)
    expect(ashby?.path).toBe(join(root, "skills", "ashby", "SKILL.md"))

    const write = skills[1]
    expect(write?.name).toBe("ashby-write")
    expect(write?.description).toBe(
      "Before any Ashby change: create a candidate, add a note, add to a job, move or archive an application, edit an AI screening draft, or report a problem to Ashby. Not for reads.",
    )
    expect(write?.content.startsWith("# Changes in Ashby\n")).toBe(true)
    expect(write?.content.includes("---")).toBe(false)
    expect(write?.path).toBe(join(root, "skills", "ashby-write", "SKILL.md"))
  })

  test("YAML block scalars are folded, literal or stripped as YAML specifies", () => {
    const cases: readonly [string, string, string][] = [
      ["folded", ">", "first line second line\n"],
      ["literal", "|", "first line\nsecond line\n"],
      ["folded-strip", ">-", "first line second line"],
      ["literal-strip", "|-", "first line\nsecond line"],
      ["folded-keep", ">+", "first line second line\n"],
      ["literal-keep", "|+", "first line\nsecond line\n"],
    ]
    for (const [name, marker, expected] of cases) {
      const directory = fixture({ [name]: `---\nname: ${name}\ndescription: ${marker}\n  first line\n  second line\n---\n\n# Body\n` })
      try {
        expect(readSkills(directory)[0]?.description, name).toBe(expected)
      } finally {
        rmSync(directory, { recursive: true, force: true })
      }
    }

    for (const marker of [">", "|"]) {
      const empty = fixture({ empty: `---\nname: empty\ndescription: ${marker}\n---\n\n# Body\n` })
      try {
        expect(() => readSkills(empty), marker).toThrow(/has no frontmatter description/)
      } finally {
        rmSync(empty, { recursive: true, force: true })
      }
    }

    for (const marker of [">", "|", ">-", "|-"]) {
      const quoted = fixture({ marker: `---\nname: marker\ndescription: '${marker}'\n---\n\n# Body\n` })
      try {
        expect(() => readSkills(quoted), marker).toThrow(/only a block marker/)
      } finally {
        rmSync(quoted, { recursive: true, force: true })
      }
    }

    const broken = fixture({ broken: "---\nname: broken\ndescription: [unclosed\n---\n\n# Body\n" })
    try {
      expect(() => readSkills(broken)).toThrow(/has frontmatter that is not valid YAML/)
    } finally {
      rmSync(broken, { recursive: true, force: true })
    }
  })

  test("a skill file must have the frontmatter shape the plugin registers", () => {
    const cases: readonly [string, Readonly<Record<string, string>>, RegExp][] = [
      ["no frontmatter", { broken: "# Broken\n" }, /SCHEMA_VIOLATION: skills\/broken\/SKILL.md has no frontmatter\. Next step: /],
      ["not a mapping", { broken: "---\n- one\n---\n\n# Body\n" }, /has frontmatter that is not a mapping/],
      ["name not text", { broken: "---\nname: 7\ndescription: A description.\n---\n\n# Body\n" }, /has a frontmatter name that is not text/],
      ["description not text", { broken: "---\nname: broken\ndescription: 7\n---\n\n# Body\n" }, /has a frontmatter description that is not text/],
      ["no name", { broken: "---\ndescription: A description.\n---\n\n# Body\n" }, /has no frontmatter name/],
      ["another name", { broken: "---\nname: other\ndescription: A description.\n---\n\n# Body\n" }, /names "other", not its directory "broken"/],
      ["no description", { broken: "---\nname: broken\n---\n\n# Body\n" }, /has no frontmatter description/],
      ["empty content", { broken: "---\nname: broken\ndescription: A description.\n---\n\n" }, /has no content below its frontmatter/],
    ]
    for (const [name, files, expected] of cases) {
      const directory = fixture(files)
      try {
        expect(() => readSkills(directory), name).toThrow(expected)
      } finally {
        rmSync(directory, { recursive: true, force: true })
      }
    }

    const missing = mkdtempSync(join(tmpdir(), "ashby-skills-"))
    try {
      mkdirSync(join(missing, "empty"), { recursive: true })
      expect(() => readSkills(missing)).toThrow(/skills\/empty\/SKILL.md is missing/)
    } finally {
      rmSync(missing, { recursive: true, force: true })
    }

    const none = mkdtempSync(join(tmpdir(), "ashby-skills-"))
    try {
      expect(() => readSkills(none)).toThrow(/skills\/ holds no <name>\/SKILL\.md/)
    } finally {
      rmSync(none, { recursive: true, force: true })
    }
  })
})

describe("registerSkills", () => {
  test("adds every checked skill and returns a disposer", async () => {
    const added: { id: string; name: string; description?: string; path: string; content: string }[] = []
    let disposed = false
    const context = {
      skill: {
        async transform(callback: (editor: { add: (skill: (typeof added)[number]) => void }) => void) {
          callback({ add: (skill) => added.push(skill) })
          return {
            async dispose() {
              disposed = true
            },
          }
        },
      },
    } as unknown as Plugin.Context

    const registration = await registerSkills(context)
    expect(added.map((skill) => skill.id)).toEqual(["ashby", "ashby-write"])
    expect(added[0]?.name).toBe("ashby")
    expect(added[0]?.description).toBe(
      "The user's Ashby candidates, pipeline, interviews, feedback and tasks: find a record, count a pipeline, prepare for an interview, read AI screening. Not for changes: load ashby-write.",
    )
    expect(added[0]?.path).toBe(join(root, "skills", "ashby", "SKILL.md"))
    expect(added[0]?.content.startsWith("# Ashby\n")).toBe(true)
    expect(added[1]?.name).toBe("ashby-write")

    await registration.dispose()
    expect(disposed).toBe(true)
  })
})

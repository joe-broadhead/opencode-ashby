import { describe, expect, test } from "vitest"
import { parseSkill } from "../../src/skills.ts"

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

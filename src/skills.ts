/**
 * The plugin's hand-written skills. OpenCode discovers a project's own `skills/` folder, but a plugin's skills are not
 * discovered: they are added through the host's `ctx.skill.transform`, and nothing else registers them. Each is read
 * once at setup from `skills/<id>/SKILL.md`. A missing or broken file does not stop the plugin, because the server and
 * the permission rules still work; it is reported as a problem in status instead.
 */
import { readdir, readFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { type Plugin, Skill } from "@opencode/plugin"

/** `skills/` at the package root, next to `dist/` (and next to `src/` in the repository). */
export const SKILLS_DIR = fileURLToPath(new URL("../skills/", import.meta.url))

const REINSTALL = "Reinstall the plugin."
const notLoaded = (name: string, problem: string) =>
  `SKILLS_INVALID: The "${name}" skill was not loaded: skills/${name}/SKILL.md ${problem}. Next step: ${REINSTALL}`
const unreadable = (problem: string) => `SKILLS_INVALID: the skills directory could not be read (${problem}). Next step: ${REINSTALL}`

/** The reason a filesystem error gives, without its message, which can hold a path. */
const codeOf = (error: unknown): string => {
  const code = (error as { code?: unknown }).code
  return typeof code === "string" ? code : "unknown error"
}

/** Parses `---` frontmatter with `name` and `description`; the body after it is the skill's content. */
export function parseSkill(name: string, path: string, text: string): Skill.Info {
  const fail = (problem: string) => new Error(notLoaded(name, problem))
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text.replace(/\r\n/g, "\n"))
  if (!match) throw fail("has no frontmatter")
  const fields = new Map(
    match[1]!.split("\n").map((line) => [
      line.slice(0, line.indexOf(":")).trim(),
      line
        .slice(line.indexOf(":") + 1)
        .trim()
        .replace(/^(["'])(.*)\1$/, "$2"),
    ]),
  )
  if (fields.get("name") !== name) throw fail(`must be named "${name}" in its frontmatter`)
  const description = fields.get("description")
  if (!description) throw fail("has no description")
  if (/^[>|][+-]?\d*$/.test(description)) throw fail("has an unreadable block scalar description")
  const content = match[2]!.trim()
  if (content === "") throw fail("has an empty body")
  return { id: Skill.ID.make(name), name: Skill.Name.make(name), description, path: Skill.Info.fields.path.make(path), content }
}

/**
 * Reads every `skills/<id>/SKILL.md` before the synchronous transform needs them. A missing or broken skill file does
 * not stop the plugin, because the server and the permission rules still work; it is reported as a problem in status
 * instead.
 */
export async function loadSkills(directory = SKILLS_DIR) {
  const skills: Skill.Info[] = []
  const problems: string[] = []
  let names: string[]
  try {
    names = (await readdir(directory, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
  } catch (error) {
    return { skills, problems: [unreadable(codeOf(error))] }
  }
  for (const name of names) {
    const path = join(directory, name, "SKILL.md")
    try {
      skills.push(parseSkill(name, path, await readFile(path, "utf8")))
    } catch (error) {
      const code = (error as { code?: unknown }).code
      problems.push(
        code === undefined && error instanceof Error && error.message.startsWith("SKILLS_INVALID:")
          ? error.message
          : notLoaded(name, code === "ENOENT" ? "is missing" : `cannot be read (${codeOf(error)})`),
      )
    }
  }
  return { skills, problems }
}

/** Adds every loaded skill through the host's skill editor; the registration is disposed with the plugin. */
export function registerSkills(skill: Pick<Plugin.Context["skill"], "transform">, skills: readonly Skill.Info[]) {
  return skill.transform((editor) => {
    for (const info of skills) editor.add(info)
  })
}

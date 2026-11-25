/**
 * The manifest is the plugin's declaration, so this test is the declaration's own proof: the contract validates it,
 * the 25 rows match the recorded inventory and Ashby's 22 tools, every class is the recorded one, and none of the
 * removed keys (`agent`, `pinned`, `plans`, `commits`, `effect`) or package keys is back.
 */
import { readFileSync } from "node:fs"
import { checkManifest, manifestHash, TESTED_OPENCODE } from "@we-the-rebel-alliance/plugin-contract/manifest"
import { describe, expect, test } from "vitest"
import { manifest, packageName, version } from "../../src/manifest.ts"

const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as Record<string, any>
const recorded = JSON.parse(readFileSync(new URL("./ashby-tools.json", import.meta.url), "utf8")) as { tools: { name: string }[] }

/** The inventory's classes, by tool name. */
const CLASSES: Record<string, "read" | "write" | "send"> = {
  add_note_to_candidate: "write",
  change_application_stage: "send",
  consider_candidate_for_job: "send",
  create_ai_interviewer: "write",
  create_ai_interviewer_version: "write",
  create_candidate: "write",
  describe_object_fields: "read",
  filter_records: "read",
  get_ai_interviewer_details: "read",
  get_ai_screening_interview_analytics: "read",
  get_ai_screening_interview_results: "read",
  get_candidate: "read",
  get_interview_details: "read",
  get_interview_plan: "read",
  get_job_pipeline: "read",
  get_pending_tasks: "read",
  get_record_details: "read",
  get_submitted_feedback: "read",
  list_interviews: "read",
  search_records_by_name: "read",
  submit_mcp_feedback: "send",
  update_ai_interviewer_outline: "write",
}

const own = Object.entries(manifest.methods).filter(([method]) => !method.startsWith("mcp:"))
const passThrough = Object.entries(manifest.methods).filter(([method]) => method.startsWith("mcp:"))

describe("the capabilities manifest", () => {
  test("is a valid contract v0 manifest with exactly the eight top-level keys", () => {
    expect(checkManifest(manifest)).toEqual({ ok: true, value: manifest })
    expect(Object.keys(pkg["capabilities"]).sort()).toEqual(["accounts", "actions", "events", "methods", "options", "plugin", "sources", "version"])
    expect(pkg["capabilities"].version).toBe(1)
    // The exact top-level key set proves no removed or runtime key is back, without naming one app.
    expect(Object.keys(pkg).sort()).toEqual([
      "bugs",
      "capabilities",
      "description",
      "devDependencies",
      "exports",
      "files",
      "homepage",
      "keywords",
      "license",
      "name",
      "repository",
      "scripts",
      "type",
      "version",
    ])
    expect(manifestHash(manifest)).toMatch(/^sha256:[0-9a-f]{64}$/)
    expect(packageName).toBe("@we-the-rebel-alliance/ashby-plugin")
    expect(version).toBe("0.0.0")
  })

  test("declares the package shape the standard names: one server entry, no runtime dependencies, pinned dev tooling", () => {
    expect(pkg["name"]).toBe("@we-the-rebel-alliance/ashby-plugin")
    expect(pkg["version"]).toBe("0.0.0")
    expect(pkg["type"]).toBe("module")
    expect(pkg["license"]).toBe("MIT")
    expect(pkg["repository"]).toBe("github:we-the-rebel-alliance/ashby-plugin")
    expect(pkg["exports"]).toEqual({ "./server": "./dist/index.js" })
    expect(pkg["files"]).toEqual(["dist", "skills", "assets", "README.md", "LICENSE"])
    expect(Object.keys(pkg["scripts"]).sort()).toEqual(["build", "check", "conformance", "lint", "test", "test:pack", "typecheck"])
    expect(pkg["devDependencies"]).toEqual({
      "@biomejs/biome": "2.6.9",
      "@opencode/client": "2.4.1",
      "@opencode/plugin": "2.4.1",
      "@opencode/sdk": "2.4.1",
      "@types/node": "24.19.2",
      "@we-the-rebel-alliance/plugin-contract": "github:we-the-rebel-alliance/plugin-contract#v0.0.0",
      esbuild: "0.28.2",
      typescript: "5.9.3",
      vitest: "5.1.1",
    })
  })

  test("names the provider once, with the contract's host range and the tested release", () => {
    expect(manifest.plugin).toMatchObject({
      name: "ashby",
      title: "Ashby",
      vendor: { id: "ashby", name: "Ashby", domain: "ashbyhq.com" },
      host: { opencode: ">=2.4.1 <2.5.0", tested: [TESTED_OPENCODE] },
    })
    expect(manifest.plugin.summary.length).toBeLessThanOrEqual(400)
    expect(manifest.plugin.summary.length).toBeLessThanOrEqual(300)
    expect(manifest.plugin.summary).not.toMatch(/[\r\n]/)
    expect(manifest.plugin.icons.map((icon) => icon.src)).toEqual(["assets/icon.svg", "assets/icon-128.png", "assets/icon-256.png"])
    for (const icon of manifest.plugin.icons) {
      expect(() => readFileSync(new URL(`../../${icon.src}`, import.meta.url))).not.toThrow()
      expect(icon.type).toMatch(/^image\//)
    }
  })

  test("holds accounts with mcp, an empty profile and no scope of its own", () => {
    expect(manifest.accounts).toEqual({
      via: "mcp",
      profile: { $ref: "#/options/properties/accounts/additionalProperties" },
      owner: "ashby",
    })
    const options = manifest.options as { properties: Record<string, any>; additionalProperties: boolean }
    expect(options.properties["accounts"]).toEqual({
      type: "object",
      description: "One profile per account alias. Each alias is its own Ashby MCP server, such as ashby-work.",
      additionalProperties: { type: "object", properties: {}, additionalProperties: false },
    })
    expect(options.properties["access"]).toMatchObject({ type: "string", enum: ["all", "ask-changes", "read-only"], default: "all" })
    expect(options.properties["allowUntestedHost"]).toMatchObject({ type: "boolean", default: false })
    expect(options.additionalProperties).toBe(false)
  })

  test("declares 25 methods: 3 own and 22 pass-through, with the inventory's 17 reads, 5 writes and 3 sends", () => {
    expect(Object.keys(manifest.methods)).toHaveLength(25)
    expect(own).toHaveLength(3)
    expect(passThrough).toHaveLength(22)
    const classes: Record<string, number> = {}
    for (const item of Object.values(manifest.methods)) classes[item.class] = (classes[item.class] ?? 0) + 1
    expect(classes).toEqual({ read: 17, write: 5, send: 3 })
  })

  test("gives every own method its recorded class, account rule and operations", () => {
    expect(manifest.methods["status"]).toEqual({ class: "read", accounts: "none" })
    expect(manifest.methods["events_list"]).toEqual({ class: "read", accounts: "optional", operations: ["list_interviews"] })
    expect(manifest.methods["probe"]).toEqual({ class: "read", accounts: "optional" })
    for (const [method] of own) expect(pkg["capabilities"].methods[method]).not.toHaveProperty("agent")
  })

  test("declares each of Ashby's 22 tools once, with its recorded class, accounts none and its own operation", () => {
    expect(passThrough.map(([method]) => method.slice("mcp:".length)).sort()).toEqual(recorded.tools.map((tool) => tool.name).sort())
    expect(new Set(recorded.tools.map((tool) => tool.name)).size).toBe(22)
    for (const [method, item] of passThrough) {
      const tool = method.slice("mcp:".length)
      expect({ method, class: item.class }).toEqual({ method, class: CLASSES[tool] })
      expect(item).toEqual({ class: CLASSES[tool], accounts: "none", operations: [tool] })
    }
    expect(Object.keys(manifest.methods)).not.toContain("mcp:*")
  })

  test("carries no agent, pinned, plans, commits or effect key, and no plans/commits pair exists", () => {
    for (const [method, item] of Object.entries(manifest.methods)) {
      for (const key of Object.keys(item))
        expect({ method, key, allowed: ["class", "accounts", "operations"].includes(key) }).toEqual({ method, key, allowed: true })
      expect(item).not.toHaveProperty("agent")
      expect(item).not.toHaveProperty("pinned")
      expect(item).not.toHaveProperty("plans")
      expect(item).not.toHaveProperty("commits")
      expect(item).not.toHaveProperty("effect")
    }
    expect(manifest.actions).toEqual([])
  })

  test("declares one source exactly as the shared interface describes it, with no scope and no thumbnail", () => {
    expect(manifest.sources).toEqual([
      {
        id: "ashby.interviews",
        kind: "events",
        reads: "meeting",
        method: "events_list",
        input: { source: "ashby" },
        service: { id: "ashby.interviews", label: "Interviews" },
        operations: ["list_interviews"],
        cadence: { suggestMinutes: 2 },
        signals: ["bus"],
        private: true,
        cost: { class: "free" },
        maxBytes: 65536,
      },
    ])
    expect(manifest.sources[0]).not.toHaveProperty("scope")
    expect(manifest.sources[0]).not.toHaveProperty("thumbnails")
  })

  test("declares the one bus event and nothing else", () => {
    expect(manifest.events).toEqual({ changed: {} })
  })
})

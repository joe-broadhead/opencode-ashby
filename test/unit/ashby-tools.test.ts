// The tool lists in src/ashby-tools.ts are the one record of Ashby's tools; everything else derives from them.
import { describe, expect, test } from "bun:test"
import { classify, DESTRUCTIVE_TOOLS, READ_TOOLS, WRITE_TOOLS } from "../../src/ashby-tools.js"

const ALL = [...READ_TOOLS, ...WRITE_TOOLS, ...DESTRUCTIVE_TOOLS]

describe("Ashby's tool lists", () => {
  test("name each tool once, in one list only, as a plain lower-case name without the server prefix", () => {
    expect(new Set(ALL).size).toBe(ALL.length)
    for (const name of ALL) expect(name).toMatch(/^[a-z][a-z0-9_]{0,63}$/)
    expect(ALL.filter((name) => name.startsWith("ashby_"))).toEqual([])
    for (const list of [READ_TOOLS, WRITE_TOOLS]) expect([...list]).toEqual([...list].sort())
  })

  test("classify each tool by its list, and everything else as unknown", () => {
    for (const tool of READ_TOOLS) expect(classify(tool)).toBe("read")
    for (const tool of WRITE_TOOLS) expect(classify(tool)).toBe("write")
    for (const tool of DESTRUCTIVE_TOOLS) expect(classify(tool)).toBe("destructive")
    for (const tool of ["shiny_new_tool", "", "ashby_get_candidate", "GET_CANDIDATE", "describe"]) expect(classify(tool)).toBe("unknown")
  })

  test("reads never change anything: no create, add, change, consider, submit or other change verb is a read", () => {
    const change = /^(create|add|change|consider|submit|send|update|move|archive|delete|set)_/
    expect(READ_TOOLS.filter((tool) => change.test(tool))).toEqual([])
    expect([...WRITE_TOOLS, ...DESTRUCTIVE_TOOLS].filter((tool) => !change.test(tool))).toEqual([])
  })

  test("moving or archiving a candidate, and feedback to Ashby, are denied; considering a candidate for a job asks", () => {
    expect([...DESTRUCTIVE_TOOLS].sort()).toEqual(["change_application_stage", "submit_mcp_feedback"])
    expect(WRITE_TOOLS).toContain("consider_candidate_for_job")
    expect(WRITE_TOOLS).toContain("add_note_to_candidate")
  })
})

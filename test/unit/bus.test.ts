/**
 * The one bus wiring: a completed non-read pass-through tool for an alias emits `changed`; a read, an errored call or
 * another tool emits nothing. The tool ids are the same ones the access rules derive, so a nudge can never name a tool
 * the plugin does not declare.
 */

import { toolAction } from "@we-the-rebel-alliance/plugin-contract/access"
import { describe, expect, test } from "vitest"
import { changedTools } from "../../src/bus.ts"
import { manifest } from "../../src/manifest.ts"
import { startHarness } from "../support/harness.ts"

const harness = () => startHarness({ accounts: { work: {}, personal: {} } })

describe("changedTools", () => {
  test("maps every non-read pass-through tool for every alias, and no read", () => {
    const tools = changedTools(manifest, ["work", "personal"])
    const nonRead = Object.entries(manifest.methods).filter(([method, item]) => method.startsWith("mcp:") && item.class !== "read")
    expect(nonRead).toHaveLength(8)
    expect(tools.size).toBe(16)
    expect(tools.get(toolAction("ashby-work", "add_note_to_candidate"))).toEqual({ alias: "work", method: "mcp:add_note_to_candidate" })
    expect(tools.get(toolAction("ashby-personal", "change_application_stage"))).toEqual({ alias: "personal", method: "mcp:change_application_stage" })
    expect(tools.has(toolAction("ashby-work", "list_interviews"))).toBe(false)
    expect(tools.has(toolAction("ashby-work", "get_candidate"))).toBe(false)
  })

  test("covers the default account's bare server when there is no alias", () => {
    const tools = changedTools(manifest, [])
    expect(tools.get(toolAction("ashby", "submit_mcp_feedback"))).toEqual({ alias: "default", method: "mcp:submit_mcp_feedback" })
  })
})

describe("the execute.after hook", () => {
  test("emits changed once for a completed non-read tool, with the alias it ran for", async () => {
    const plugin = await harness()
    try {
      await plugin.fireToolHook({ status: "completed", tool: "ashby-work_add_note_to_candidate" })
      expect(plugin.emitted).toEqual([{ event: "changed", data: { capability: "ashby.interviews", account: "work", reason: "write" } }])
      await plugin.fireToolHook({ status: "completed", tool: "ashby-personal_change_application_stage" })
      expect(plugin.emitted).toEqual([
        { event: "changed", data: { capability: "ashby.interviews", account: "work", reason: "write" } },
        { event: "changed", data: { capability: "ashby.interviews", account: "personal", reason: "write" } },
      ])
    } finally {
      await plugin.dispose()
    }
  })

  test("emits nothing for a read, an errored call, another tool or a missing tool id", async () => {
    const plugin = await harness()
    try {
      await plugin.fireToolHook({ status: "completed", tool: "ashby-work_list_interviews" })
      await plugin.fireToolHook({ status: "completed", tool: "ashby-work_get_candidate" })
      await plugin.fireToolHook({ status: "error", tool: "ashby-work_add_note_to_candidate" })
      await plugin.fireToolHook({ status: "completed", tool: "another-plugin_write" })
      await plugin.fireToolHook({ status: "completed" })
      expect(plugin.emitted).toEqual([])
    } finally {
      await plugin.dispose()
    }
  })

  test("falls back to the tool's permission when the hook carries no tool id", async () => {
    const plugin = await harness()
    try {
      await plugin.fireToolHook({ status: "completed", info: { options: { permission: "ashby-work_create_candidate" } } })
      expect(plugin.emitted).toEqual([{ event: "changed", data: { capability: "ashby.interviews", account: "work", reason: "write" } }])
    } finally {
      await plugin.dispose()
    }
  })
})

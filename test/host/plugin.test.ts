/**
 * The built bundle on the real OpenCode 2.4.1 host: `createHost` from the contract's kit loads `dist/index.js` through
 * OpenCode's own resolver, runs the embedded SDK host and records what the real `ctx` registered. This is a small
 * companion to the kit's T1 (the hard gate), not a replacement: it asserts the doors, the namespace, the two aliases'
 * access rules and a validating status answer.
 */
import { fileURLToPath } from "node:url"
import { evaluate } from "@we-the-rebel-alliance/plugin-contract/access"
import { ACCOUNT_STATES, STATUS_SCHEMA } from "@we-the-rebel-alliance/plugin-contract/accounts"
import { createHost } from "@we-the-rebel-alliance/plugin-contract/kit"
import { describe, expect, test } from "vitest"
import { manifest } from "../../src/manifest.ts"

const directory = fileURLToPath(new URL("../..", import.meta.url))
const ACCOUNTS = { work: {}, personal: {} }

/** The keys `STATUS_SCHEMA` requires, and the account-entry keys it defines. */
const STATUS_KEYS = ["accounts", "host", "name", "nextStep", "state", "unguardedAgents", "version"]
const ACCOUNT_KEYS = ["alias", "owner", "reason", "state"]

const check = (status: Record<string, unknown>) => {
  expect(Object.keys(status).sort()).toEqual(STATUS_KEYS)
  expect(status["name"]).toBe("ashby")
  expect(status["version"]).toBe("0.0.8")
  expect(status["host"]).toEqual({ version: "2.4.1", range: ">=2.4.1 <2.5.0", tested: ["2.4.1"] })
  expect(["ready", "needs_sign_in", "error"]).toContain(status["state"])
  expect(Array.isArray(status["unguardedAgents"])).toBe(true)
  expect(status["nextStep"] === null || typeof status["nextStep"] === "string").toBe(true)
  const accounts = status["accounts"] as Record<string, unknown>[]
  expect(accounts.map((entry) => entry["alias"])).toEqual(["work", "personal"])
  for (const entry of accounts) {
    for (const key of Object.keys(entry)) expect(ACCOUNT_KEYS).toContain(key)
    expect(ACCOUNT_STATES).toContain(entry["state"])
  }
  expect((STATUS_SCHEMA.required as string[]).sort()).toEqual(STATUS_KEYS)
}

describe("the built plugin on OpenCode 2.4.1", () => {
  test("loads with the ashby id and namespace, three tools, one RPC id and the two aliases' rules", async () => {
    const run = await createHost({ directory, version: "2.4.1", pluginId: "ashby", options: { access: "all", accounts: ACCOUNTS } })
    try {
      expect(run.failure).toBeUndefined()
      expect(run.refusal).toBeUndefined()
      expect(run.definition?.id).toBe("ashby")
      expect(run.namespace).toEqual({ name: "ashby", description: manifest.plugin.summary })
      expect(run.tools.map((tool) => tool.permission).sort()).toEqual(["ashby.events_list", "ashby.probe", "ashby.status"])
      expect(run.tools.every((tool) => tool.codemode === true)).toBe(true)
      expect(run.rpc?.id).toBe("ashby")
      expect([...(run.rpc?.methods ?? [])].sort()).toEqual(["events_list", "probe", "status"])
      expect(run.rpc?.events).toEqual([])
      expect(run.agents.length).toBeGreaterThan(0)
      for (const agent of run.agents) {
        if (evaluate(agent.permissions, "*", "*") === "deny") continue
        for (const action of [
          "ashby-work_list_interviews",
          "ashby-personal_list_interviews",
          "ashby-work_add_note_to_candidate",
          "ashby.events_list",
          "ashby.probe",
          "ashby.status",
        ]) {
          expect({ agent: agent.id, action, effect: evaluate(agent.permissions, action, "*") }).toEqual({ agent: agent.id, action, effect: "allow" })
        }
      }
    } finally {
      await run.close()
    }
  }, 60_000)

  test("answers a validating status over RPC, and refuses a write tool under read-only", async () => {
    const all = await createHost({ directory, version: "2.4.1", pluginId: "ashby", options: { access: "all", accounts: ACCOUNTS } })
    try {
      const status = await all.call("status", {})
      expect(status.ok).toBe(true)
      if (status.ok) check(status.output as Record<string, unknown>)
      const probe = await all.call("probe", { account: "work" })
      expect(probe.ok).toBe(false)
      if (!probe.ok) expect(["NEEDS_SIGN_IN", "UNAVAILABLE"]).toContain(probe.code)
    } finally {
      await all.close()
    }
    const readOnly = await createHost({ directory, version: "2.4.1", pluginId: "ashby", options: { access: "read-only", accounts: ACCOUNTS } })
    try {
      expect(readOnly.failure).toBeUndefined()
      for (const agent of readOnly.agents) {
        if (evaluate(agent.permissions, "*", "*") === "deny") continue
        expect({ agent: agent.id, effect: evaluate(agent.permissions, "ashby-work_add_note_to_candidate", "*") }).toEqual({ agent: agent.id, effect: "deny" })
        expect({ agent: agent.id, effect: evaluate(agent.permissions, "ashby-personal_list_interviews", "*") }).toEqual({ agent: agent.id, effect: "allow" })
      }
    } finally {
      await readOnly.close()
    }
  }, 90_000)
})

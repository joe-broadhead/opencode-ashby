import { describe, expect, test } from "bun:test"
import { checkHost } from "../../src/host-version.js"
import { defaultRules } from "../../src/permissions.js"
import { buildStatus, formatStatus, readStatus, registerStatusCommand, registerStatusRpc, shortReason, StatusRpc, type Status, type StatusContext, type StatusFacts } from "../../src/status.js"
import { VERSION } from "../../src/version.js"
import { DENIED_TOOLS, WRITE_TOOLS } from "../../src/ashby-tools.js"
import { allow } from "./fake.js"

const SIGN_IN = "Run /connect and choose Ashby, then press o or Enter to open the link (in a terminal, opencode mcp auth ashby opens it automatically)."
const NOTHING_TO_DO = "Nothing to do."
/** The default rules as /ashby-status shows them: one rule a line, a JSON array body. */
const AGENT_RULES = defaultRules().map((rule, index, rules) => `  ${JSON.stringify(rule)}${index < rules.length - 1 ? "," : ""}`).join("\n")

const host = checkHost("2.2.3", false)
const URL = "https://mcp.ashbyhq.com/mcp/v1"
const base: StatusFacts = { server: { status: "connected" }, source: { type: "plugin", url: URL, signIn: "oauth" }, host, tools: ["search_records_by_name"] }
const guarded = { id: "build", permissions: [allow("*"), ...defaultRules()] }
const RULES = "no agent runs new Ashby tools unasked"
const POSTURE = `reads run without asking; the ${WRITE_TOOLS.length} writes ask first; ${DENIED_TOOLS.join(" and ")} are off`
const ACCESS = `${POSTURE}; ${RULES}`

describe("buildStatus", () => {
  test("connected, with the sign-in's label, and nothing left to do", () => {
    const status = buildStatus({ ...base, account: "Example Recruiter", agents: [guarded] })
    expect(status).toEqual({
      version: VERSION,
      state: "connected",
      source: { type: "plugin", url: URL, signIn: "oauth" },
      account: "Example Recruiter",
      tools: 1,
      deniedTools: [],
      listing: false,
      unknownCount: 0,
      unknownTools: [],
      unguardedAgents: [],
      host: { version: "2.2.3", range: ">=2.2.3 <2.3.0", tested: true },
      problems: [],
      nextStep: "Nothing to do.",
    })
    expect(formatStatus(status)).toBe(
      [
        "Ashby status",
        "- Connection: connected (https://mcp.ashbyhq.com/mcp/v1, registered by this plugin)",
        "- Account: Example Recruiter",
        `- Access: ${ACCESS}`,
        "- Tools: 1 available, 0 unknown",
        "- Agents without default rules: none",
        "- OpenCode: 2.2.3 (tested; supported range >=2.2.3 <2.3.0)",
        "- Next step: Nothing to do.",
      ].join("\n"),
    )
  })

  test("without a sign-in label, the Account row says Ashby's MCP reports no account name, and the RPC has no account", () => {
    const status = buildStatus(base)
    expect(status).not.toHaveProperty("account")
    const text = formatStatus(status)
    expect(text).toContain("- Account: account name not reported by Ashby's MCP\n")
    expect(text).toContain(`- Access: ${ACCESS}\n`)
    expect(text).not.toContain("Plan")
    expect(buildStatus({ ...base, account: " \n " })).not.toHaveProperty("account")
  })

  test.each([
    [{ status: "needs_auth", error: "Authorization required" }, "sign_in_required", "sign-in required", SIGN_IN],
    [{ status: "failed", error: "fetch failed" }, "failed", "failed", "Check your network, then run /ashby-status again."],
    [{ status: "disabled" }, "disabled", "disabled", `The ashby MCP server is disabled. Enable it in /mcps, or remove "disabled": true from mcp.servers.ashby in opencode.json.`],
    [{ status: "pending" }, "connecting", "connecting", "Ashby is still connecting. Run /ashby-status again in a few seconds."],
    [undefined, "not_configured", "not configured", "OpenCode has no ashby MCP server. Check that no organisation policy (mcp.use) or other plugin removes it, then restart OpenCode."],
  ] as const)("%j is %s with the exact label and next step", (server, state, label, nextStep) => {
    const status = buildStatus({ ...base, ...(server ? { server } : { server: undefined }) })
    expect(status.state).toBe(state)
    expect(status.nextStep).toBe(nextStep)
    expect(formatStatus(status)).toContain(`- Connection: ${label}`)
    expect(formatStatus(status)).toContain(`- Next step: ${nextStep}`)
  })

  test("shows a failure's reason on one short line, without URL queries, and never the text of a needed sign-in", () => {
    const failed = buildStatus({ ...base, server: { status: "failed", error: "SSE error:\n  fetch https://mcp.ashbyhq.com/mcp/v1?token=secret-123 failed.\n" } })
    expect(failed.error).toBe("SSE error: fetch https://mcp.ashbyhq.com/mcp/v1 failed")
    expect(formatStatus(failed)).toContain(`- Connection: failed (SSE error: fetch https://mcp.ashbyhq.com/mcp/v1 failed; ${URL}, registered by this plugin)`)
    expect(shortReason("word ".repeat(100))).toHaveLength(160)
    expect(shortReason(" \n. ")).toBeUndefined()
    const signIn = buildStatus({ ...base, server: { status: "needs_auth", error: "Visit https://mcp-auth.ashbyhq.com/oidc/auth?code=abc to sign in" } })
    expect(signIn.error).toBeUndefined()
    expect(formatStatus(signIn)).not.toContain("authorize")
  })

  test("adopted and conflicting servers", () => {
    expect(formatStatus(buildStatus({ ...base, source: { type: "adopted", url: URL, signIn: "oauth" } }))).toContain(`- Connection: connected (${URL}, your own mcp.servers.ashby, used unchanged)`)
    const conflict = buildStatus({ ...base, source: { type: "conflict", url: "https://ashby.example.com/mcp", expected: URL } })
    expect(conflict.state).toBe("conflict")
    expect(conflict.nextStep).toBe(
      `Your OpenCode config defines mcp.servers.ashby with https://ashby.example.com/mcp, but the plugin uses ${URL}. Point it at ${URL} or remove it, then restart OpenCode.`,
    )
    expect(formatStatus(conflict)).toContain("- Connection: conflict (your mcp.servers.ashby points at https://ashby.example.com/mcp)")
  })

  test("the user's own entry without OAuth is named as such, and its failure says Ashby signs in only with OAuth", () => {
    const own = { type: "adopted", url: URL, signIn: "own" } as const
    expect(formatStatus(buildStatus({ ...base, source: own }))).toContain(`- Connection: connected (${URL}, your own mcp.servers.ashby without OAuth, used unchanged)`)
    expect(buildStatus({ ...base, source: own, server: { status: "failed", error: "HTTP 401" } }).nextStep).toBe(
      'Ashby\'s server signs in only with OAuth: remove "oauth": false from your own mcp.servers.ashby in opencode.json, then restart OpenCode and sign in.',
    )
  })

  test("connected with no tools points at Ashby's MCP Server switch and Elevated Access", () => {
    expect(buildStatus({ ...base, tools: [], agents: [{ id: "reviewer", permissions: [allow("*")] }] }).nextStep).toBe(
      "Ashby lists no tools for this account. Ask an Ashby Org Admin to turn on MCP Server in Admin > Organization Setup > Opt-In Features, and to give you Elevated Access.",
    )
  })

  test("counts the available tools, names the unknown ones, and counts denied ones apart; missing known tools are normal", () => {
    const status = buildStatus({ ...base, tools: ["search_records_by_name", "add_note_to_candidate", "submit_mcp_feedback", "shiny_new_tool", "schedule_interview"] })
    expect(status.tools).toBe(4)
    expect(status.deniedTools).toEqual(["submit_mcp_feedback"])
    expect(status.unknownCount).toBe(2)
    expect(status.unknownTools).toEqual(["shiny_new_tool", "schedule_interview"])
    expect(formatStatus(status)).toContain("- Tools: 4 available, 2 unknown: shiny_new_tool, schedule_interview (unknown tools ask before running); off by default: submit_mcp_feedback\n")
    expect(status.nextStep).toBe(NOTHING_TO_DO)
    const denied = buildStatus({ ...base, tools: ["search_records_by_name", "change_application_stage", "submit_mcp_feedback"] })
    expect(formatStatus(denied)).toContain("- Tools: 1 available, 0 unknown; off by default: change_application_stage and submit_mcp_feedback\n")
  })

  test("a server that just connected and lists no tools yet is still listing them, with no advice to ask an admin", () => {
    const listing = buildStatus({ ...base, tools: [], settling: true })
    expect(listing).toMatchObject({ state: "connected", tools: 0, listing: true, nextStep: "Ashby is still listing its tools. Run /ashby-status again in a few seconds." })
    const text = formatStatus(listing)
    expect(text).toContain("- Connection: connected (https://mcp.ashbyhq.com/mcp/v1, registered by this plugin; still listing its tools)")
    expect(text).toContain("- Tools: none listed yet (Ashby is still listing them)")
    expect(text).not.toContain("admin to turn on")
    // Settled, with no tools: the admin switch.
    expect(buildStatus({ ...base, tools: [], settling: false }).nextStep).toStartWith("Ashby lists no tools for this account.")
    // Not connected: the connection's own step, never "listing".
    expect(buildStatus({ ...base, tools: [], settling: true, server: { status: "pending" } })).toMatchObject({ listing: false, state: "connecting" })
  })

  test("the Access row says whether the default rules are in place, from what status can see", () => {
    expect(formatStatus(buildStatus(base))).toContain(`- Access: ${ACCESS}\n`)
    // The posture is the tool lists': 3 writes ask, 2 tools are off.
    expect(ACCESS).toContain("the 3 writes ask first; change_application_stage and submit_mcp_feedback are off")
    const missing = buildStatus({ ...base, agents: [{ id: "reviewer", permissions: [allow("*")] }] })
    expect(formatStatus(missing)).toContain(`- Access: ${POSTURE}; default rules missing in the agents listed below\n`)
    const problem = "RULES_NOT_ADDED: Ashby's default permission rules could not be added (boom), so Ashby tools may run without asking. Next step: Restart OpenCode."
    expect(formatStatus(buildStatus({ ...base, problems: [problem] }))).toContain(`- Access: ${POSTURE}; default rules not added (see the OpenCode row)\n`)
  })

  test("a failure's reason never carries a token or key the host's text echoed", () => {
    const failed = buildStatus({ ...base, server: { status: "failed", error: "HTTP 401 for Authorization: Bearer sk-fake-abcdef123456 and api_key=fake-key-000111" } })
    expect(failed.error).toBeDefined()
    expect(failed.error).not.toMatch(/sk-fake|abcdef123456|fake-key-000111/)
  })

  test("names at most 20 unknown tools, and only plain names, but counts them all", () => {
    const odd = ["Bad Name", "x".repeat(70), "evil\u001b[31m", "-dash"]
    const many = Array.from({ length: 25 }, (_, index) => `new_tool_${index}`)
    const status = buildStatus({ ...base, tools: ["search_records_by_name", ...odd, ...many] })
    expect(status.unknownCount).toBe(29)
    expect(status.unknownTools).toEqual(many.slice(0, 20))
    expect(formatStatus(status)).toContain(`- Tools: 30 available, 29 unknown: ${many.slice(0, 20).join(", ")} and 9 more (unknown tools ask before running)`)
    expect(formatStatus(buildStatus({ ...base, tools: odd }))).toContain("- Tools: 4 available, 4 unknown (unknown tools ask before running)")
  })

  test("names agents without the default rules, with the block to paste, and points the next step at it", () => {
    const status = buildStatus({ ...base, agents: [guarded, { id: "reviewer", permissions: [allow("*")] }] })
    expect(status.unguardedAgents).toEqual(["reviewer"])
    expect(status.nextStep).toBe(
      "Put the default rules shown by /ashby-status first in each listed agent's own permissions, in opencode.json or the agent's Markdown file, followed by your top-level rules for Ashby tools.",
    )
    expect(JSON.parse(`[${AGENT_RULES}]`)).toEqual(defaultRules())
    expect(formatStatus(status)).toContain(`- Agents without default rules: reviewer\n${AGENT_RULES}\n- OpenCode:`)
  })

  test("an agent whose own rules already ask or deny for every Ashby tool is not listed", () => {
    const agents = [
      { id: "asks-everything", permissions: [allow("*"), { action: "*", resource: "*", effect: "ask" as const }] },
      { id: "denies-ashby", permissions: [allow("*"), { action: "ashby_*", resource: "*", effect: "deny" as const }] },
      { id: "reviewer", permissions: [allow("*")] },
    ]
    expect(buildStatus({ ...base, agents }).unguardedAgents).toEqual(["reviewer"])
  })

  test("the sign-in step comes before the agent fix, which still shows, and there is one next step", () => {
    const status = buildStatus({ ...base, server: { status: "needs_auth", error: "x" }, agents: [{ id: "reviewer", permissions: [allow("*")] }] })
    expect(status.nextStep).toBe(SIGN_IN)
    const text = formatStatus(status)
    expect(text).toContain(`- Connection: sign-in required (${URL}, registered by this plugin)`)
    expect(text).toContain("- Agents without default rules: reviewer\n")
    expect(text.match(/Next step/g)).toHaveLength(1)
  })

  test("the rows come in the standard order", () => {
    const rows = formatStatus(buildStatus(base)).split("\n").filter((line) => line.startsWith("- ")).map((line) => line.slice(2, line.indexOf(":")))
    expect(rows).toEqual(["Connection", "Account", "Access", "Tools", "Agents without default rules", "OpenCode", "Next step"])
  })

  test("a skill of the same id at another path shadows the plugin's: status names it, after any other next step", () => {
    const own = [{ id: "ashby", path: "/pkg/skills/ashby/SKILL.md" }, { id: "ashby-write", path: "/pkg/skills/ashby-write/SKILL.md" }]
    const listed = [{ id: "ashby", path: "/projects/acme/.opencode/skills/ashby/SKILL.md" }, own[1]!, { id: "other", path: "/x" }]
    const status = buildStatus({ ...base, skills: { own, listed } })
    expect(status.shadowedSkills).toEqual([{ id: "ashby", path: "/projects/acme/.opencode/skills/ashby/SKILL.md" }])
    expect(status.nextStep).toBe(
      'Rename or move the "ashby" skill at /projects/acme/.opencode/skills/ashby/SKILL.md, which OpenCode loads instead of the plugin\'s skill of the same name.',
    )
    expect(buildStatus({ ...base, skills: { own, listed: own } })).not.toHaveProperty("shadowedSkills")
    expect(buildStatus({ ...base, skills: { own, listed }, agents: [{ id: "reviewer", permissions: [allow("*")] }] }).nextStep).toStartWith("Put the default rules")
  })

  test("an untested host and setup problems show on the OpenCode row; a problem's own next step comes first", () => {
    const outside = checkHost("2.3.0", true)
    const problem = 'SKILLS_INVALID: The "ashby" skill was not loaded: skills/ashby/SKILL.md is missing. Next step: Reinstall the plugin.'
    const status = buildStatus({ ...base, host: outside, problems: [problem] })
    expect(status.nextStep).toBe("Reinstall the plugin.")
    expect(formatStatus(status)).toContain(
      `- OpenCode: 2.3.0 (untested; supported range >=2.2.3 <2.3.0). It is outside the supported range; the plugin runs because allowUntestedHost is true. If Ashby misbehaves, use OpenCode 2.2.3, 2.2.4 or 2.2.5. ${problem}`,
    )
    expect(buildStatus({ ...base, host: outside }).nextStep).toBe(NOTHING_TO_DO)
    const inside = buildStatus({ ...base, host: checkHost("2.2.6", false) })
    expect(inside).toMatchObject({ state: "connected", host: { version: "2.2.6", tested: false }, nextStep: NOTHING_TO_DO })
    expect(buildStatus({ ...base, host: checkHost("2.2.6", false), server: { status: "needs_auth" } }).nextStep).toBe(SIGN_IN)
    expect(formatStatus(inside)).toContain("- OpenCode: 2.2.6 (untested; supported range >=2.2.3 <2.3.0)\n")
    expect(formatStatus(buildStatus({ ...base, host: checkHost("2.2.5", false) }))).toContain("- OpenCode: 2.2.5 (tested; supported range >=2.2.3 <2.3.0)\n")
  })
})

function statusContext(server: string, skills: Promise<unknown> = Promise.resolve({ data: [] }), connection: Promise<unknown> = Promise.resolve({ type: "credential", id: "c1", label: "Example Recruiter", method: "oauth" })) {
  const ctx = {
    mcp: { list: async () => ({ data: [{ name: "github", status: { status: "connected" } }, { name: "ashby", status: { status: server }, integrationID: "mcp_fake" }] }) },
    integration: { connection: { active: async (id: string) => (id === "mcp_fake" ? connection : undefined) } },
    agent: { list: async () => ({ data: [guarded, { id: "reviewer", permissions: [allow("*")] }] }) },
    tool: {
      list: async () => [
        { id: "ashby_search_records_by_name", name: "search_records_by_name", options: { namespace: "ashby" } },
        { id: "ashby_shiny_new_tool", name: "shiny_new_tool", options: { namespace: "ashby" } },
        { id: "other_search", name: "search", options: { namespace: "other" } },
        { id: "read", name: "read" },
      ],
    },
    skill: { list: () => skills },
  }
  return ctx as unknown as StatusContext
}

describe("readStatus", () => {
  test("reads connection, the sign-in's label, tools and agents through public APIs", async () => {
    const status = await readStatus(statusContext("connected"), { source: { type: "plugin", url: URL, signIn: "oauth" }, host, problems: [], listing: { changedAt: () => 0 } })
    expect(status).toMatchObject({ state: "connected", account: "Example Recruiter", tools: 2, unknownTools: ["shiny_new_tool"], unguardedAgents: ["reviewer"], listing: false })
  })

  test("a sign-in without a label, another kind of connection, or a failed lookup leaves the account out", async () => {
    for (const connection of [Promise.resolve({ type: "credential", id: "c1", label: "", method: "oauth" }), Promise.resolve({ type: "env", id: "c2" }), Promise.reject(new Error("offline"))]) {
      const status = await readStatus(statusContext("connected", undefined, connection), { host })
      expect(status).toMatchObject({ state: "connected", tools: 2 })
      expect(status).not.toHaveProperty("account")
    }
  })

  test("no tools moments after a status change is still listing; later it is not", async () => {
    const empty = statusContext("connected")
    ;(empty as unknown as { tool: { list: () => Promise<unknown[]> } }).tool.list = async () => []
    expect(await readStatus(empty, { host, listing: { changedAt: () => Date.now() } })).toMatchObject({ listing: true })
    expect(await readStatus(empty, { host, listing: { changedAt: () => Date.now() - 60_000 } })).toMatchObject({ listing: false })
  })

  test("names shadowed skills from the host's list, and a failed skill list hides nothing else", async () => {
    const own = [{ id: "ashby", path: "/pkg/skills/ashby/SKILL.md" }]
    const listed = Promise.resolve({ data: [{ id: "ashby", path: "/home-skills/ashby/SKILL.md" }] })
    expect((await readStatus(statusContext("connected", listed), { host, skills: own })).shadowedSkills).toEqual([{ id: "ashby", path: "/home-skills/ashby/SKILL.md" }])
    const failed = await readStatus(statusContext("connected", Promise.reject(new Error("offline"))), { host, skills: own })
    expect(failed).toMatchObject({ state: "connected", tools: 2 })
    expect(failed).not.toHaveProperty("shadowedSkills")
  })
})

describe("/ashby-status", () => {
  async function run(read: () => Promise<Status>) {
    const posted: unknown[] = []
    let execute: ((input: { sessionID: string }) => Promise<void>) | undefined
    await registerStatusCommand(
      {
        command: { transform: async (callback) => (callback({ add: (definition) => void (execute = definition.execute as never) }), { dispose: async () => {} }) },
        session: { synthetic: async (input) => (posted.push(input), {}) as never },
      },
      read,
    )
    await execute!({ sessionID: "ses_1" })
    return posted
  }

  test("posts the status text into the session without starting a turn", async () => {
    const posted = await run(async () => buildStatus(base))
    expect(posted).toEqual([{ sessionID: "ses_1", text: formatStatus(buildStatus(base)), description: "Ashby status", resume: false }])
  })

  test("posts a coded error with a next step, cut to one short line without URL queries, when status cannot be read", async () => {
    const posted = (await run(() => Promise.reject(new Error("failed:\n https://x.example/a?token=t")))) as { text: string }[]
    expect(posted[0]!.text).toBe("STATUS_UNAVAILABLE: Could not read Ashby's status (failed: https://x.example/a). Next step: Restart OpenCode, then run /ashby-status again.")
  })
})

describe("status RPC", () => {
  async function register(read: () => Promise<Status>) {
    const registered: { id: string; methods: string[]; status: () => Promise<unknown> }[] = []
    const error = (type: string, message: string, data: unknown) => ({ type, message, data })
    await registerStatusRpc(
      {
        register: async (definition, handlers) => {
          registered.push({ id: definition.id, methods: Object.keys(definition.methods), status: () => handlers.status({} as never, { error } as never) })
          return { dispose: async () => {}, events: { emit: async () => {} } } as never
        },
      },
      read,
    )
    return registered
  }

  test("serves the same status as /ashby-status through one read-only method", async () => {
    const registered = await register(async () => buildStatus(base))
    expect(registered.map(({ id, methods }) => ({ id, methods }))).toEqual([{ id: "ashby.recruiting", methods: ["status"] }])
    expect(await registered[0]!.status()).toEqual(buildStatus(base))
    expect(StatusRpc.events).toEqual({})
  })

  test("answers a status it cannot read with its declared error, unavailable, and a next step", async () => {
    const registered = await register(() => Promise.reject(new Error("agent list failed")))
    expect(await registered[0]!.status()).toEqual({
      type: "unavailable",
      message: "STATUS_UNAVAILABLE: Could not read Ashby's status (agent list failed).",
      data: { nextStep: "Restart OpenCode, then run /ashby-status again." },
    })
    expect(Object.keys(StatusRpc.methods.status.errors)).toEqual(["unavailable"])
  })

  test("has the fields every plugin of this family shares, with their names", () => {
    const status = buildStatus(base)
    expect({ version: status.version, host: status.host, state: status.state, unguardedAgents: status.unguardedAgents, nextStep: status.nextStep }).toEqual({
      version: VERSION,
      host: { version: "2.2.3", range: ">=2.2.3 <2.3.0", tested: true },
      state: "connected",
      unguardedAgents: [],
      nextStep: NOTHING_TO_DO,
    })
    expect(StatusRpc.methods.status.output.required).toEqual(expect.arrayContaining(["version", "host", "state", "unguardedAgents", "nextStep"]))
  })

  test("the output schema names every status field and requires the ones always present", () => {
    const { properties, required } = StatusRpc.methods.status.output
    const statuses: Status[] = [
      buildStatus({ ...base, account: "Example Recruiter", tools: ["shiny_new_tool"], agents: [{ id: "reviewer", permissions: [allow("*")] }], problems: ["p"], skills: { own: [{ id: "ashby", path: "/a" }], listed: [{ id: "ashby", path: "/b" }] } }),
      buildStatus({ ...base, server: { status: "failed", error: "fetch failed" }, source: { type: "conflict", url: "https://x.example/mcp", expected: URL }, host: checkHost("2.3.0", true) }),
    ]
    for (const status of statuses) {
      expect(Object.keys(status).filter((key) => !(key in properties))).toEqual([])
      expect(required.filter((key) => !(key in status))).toEqual([])
      expect(Object.keys(status.host).filter((key) => !(key in properties.host.properties))).toEqual([])
    }
  })
})

/**
 * `status` (`contract §11`): the plugin, the host range, and one entry per account alias.
 *
 * The account's state comes from the host's record of that alias's MCP server, never from Ashby: `connected` and
 * `pending` are `ready` (the host is connecting), `needs_auth` is `needs_sign_in`, and `disabled`, `failed` or a server
 * that is not registered is `error` with a redacted reason. `statusAnswer` builds the whole answer, so this handler keeps
 * no state of its own: it passes the versions, the states, the problems setup recorded and what
 * `await call.unguardedAgents()` answered. An unreadable agent list is that call's `{ ok: false, error }`, which
 * `statusAnswer` records as a problem and answers with an empty list, never a zero it did not read.
 */
import { type AccountSignal, accountStatuses, accountsOf, STATUS_SCHEMA, statusAnswer } from "@we-the-rebel-alliance/plugin-contract/accounts"
import type { Manifest } from "@we-the-rebel-alliance/plugin-contract/manifest"
import type { MethodHandler } from "@we-the-rebel-alliance/plugin-contract/register"
import { type HostContext, type ServerRecord, serverRecord } from "../accounts.ts"

/** The handler's own input: nothing. The register refuses an account field on an `accounts: none` method. */
export const STATUS_INPUT = { type: "object", properties: {}, additionalProperties: false } as const

/** One alias's state, from the host's record of its server. Never a provider read. */
function signalOf(record: ServerRecord): AccountSignal {
  switch (record.state) {
    case "connected":
    case "pending":
      return { state: "ready" }
    case "needs_auth":
      return { state: "needs_sign_in" }
    case "disabled":
      return { state: "error", reason: `the ${record.name} server is disabled` }
    case "failed":
      return { state: "error", reason: record.reason ?? `the ${record.name} server could not connect` }
    case "missing":
      return { state: "error", reason: `the ${record.name} server is not registered` }
  }
}

/** What the status handler was built with: the declaration and the versions setup already read. */
export interface StatusParts {
  readonly manifest: Manifest
  readonly options: Readonly<Record<string, unknown>>
  readonly version: string
  readonly hostVersion: string
  /** What registering the accounts could not do, one sentence each. */
  readonly accountProblems: readonly string[]
  readonly context: HostContext
}

export function createStatusHandler(parts: StatusParts): MethodHandler {
  return {
    description:
      "Report this plugin's state: its OpenCode range, every Ashby account alias and whether it needs a sign-in, and one next step. It takes no account and reads no Ashby content.",
    input: STATUS_INPUT,
    output: STATUS_SCHEMA,
    async run(_input, call) {
      const plan = accountsOf(parts.manifest, parts.options)
      if (!plan.ok) {
        return statusAnswer({
          manifest: parts.manifest,
          version: parts.version,
          hostVersion: parts.hostVersion,
          accounts: [],
          problems: [...parts.accountProblems, ...plan.problems],
          unguardedAgents: await call.unguardedAgents(),
        })
      }
      const signals: Record<string, AccountSignal> = {}
      for (const account of plan.value.accounts) signals[account.alias] = signalOf(await serverRecord(parts.context, account.alias))
      return statusAnswer({
        manifest: parts.manifest,
        version: parts.version,
        hostVersion: parts.hostVersion,
        accounts: plan.value.accounts.length === 0 ? [] : accountStatuses(plan.value.accounts, signals),
        problems: parts.accountProblems,
        unguardedAgents: await call.unguardedAgents(),
      })
    },
  }
}

/**
 * The plugin's one handler table: one entry per own method, and none for a pass-through MCP tool.
 *
 * `register` validates this table against the manifest's `methods`, so a declared method without a handler, or a handler
 * the manifest does not declare, is refused at setup. The vendor's 22 MCP tools are declared as `mcp:<tool>` rows for
 * their class and access rule; their server owns them, so they have no handler here and are never proxied.
 */

import { EVENTS_LIST_INPUT_SCHEMA, PAGE_SCHEMA } from "@we-the-rebel-alliance/plugin-contract/events"
import { findSource, type Manifest, maxBytesOf } from "@we-the-rebel-alliance/plugin-contract/manifest"
import type { HandlerTable } from "@we-the-rebel-alliance/plugin-contract/register"
import type { HostContext } from "../accounts.ts"
import type { Provider } from "../provider/index.ts"
import { listEvents, SOURCE_ID } from "./events.ts"
import { createProbeHandler } from "./probe.ts"
import { createStatusHandler } from "./status.ts"

/** The source's bound when the manifest somehow omits it: the contract's default `maxBytes` for one answer. */
export const FALLBACK_MAX_BYTES = 65_536

export const EVENTS_DESCRIPTION =
  "List the interviews Ashby returns for one account since a cursor, oldest first, as meeting events. " +
  "Metadata only: the start, the title and job, the candidate and the interviewers by Ashby id and name, and a link into Ashby; never contact details, feedback, scorecards, notes or transcripts. " +
  "An interview is listed once it started 30 minutes ago, and a cancelled one is never listed. Pass the previous result's cursor with its account to list what came after; without one it starts at since, or 24 hours ago. It only reads."

/** What the handler table was built with: the declaration, its options, and the live host. */
export interface HandlerParts {
  readonly manifest: Manifest
  readonly options: Readonly<Record<string, unknown>>
  readonly provider: Provider
  readonly context: HostContext
  readonly version: string
  readonly hostVersion: string
  readonly accountProblems: readonly string[]
  /** The clock the page's windows and `asOf` read; `Date.now` in the plugin, a fixed time in a test. */
  readonly now?: (() => number) | undefined
}

/** One handler per own method, and nothing for a pass-through MCP tool. */
export function createHandlers(parts: HandlerParts): HandlerTable {
  const source = findSource(parts.manifest, SOURCE_ID)
  const maxBytes = source === undefined ? FALLBACK_MAX_BYTES : maxBytesOf(source)
  const now = parts.now ?? Date.now
  return {
    status: createStatusHandler({
      manifest: parts.manifest,
      options: parts.options,
      version: parts.version,
      hostVersion: parts.hostVersion,
      accountProblems: parts.accountProblems,
      context: parts.context,
    }),
    events_list: {
      description: EVENTS_DESCRIPTION,
      input: EVENTS_LIST_INPUT_SCHEMA,
      output: PAGE_SCHEMA,
      run: (input, call) => listEvents({ provider: parts.provider, maxBytes, now }, call, input),
    },
    probe: createProbeHandler(parts.provider),
  }
}

/**
 * `probe` (`contract §11`): who is signed in for one account, and nothing Ashby reads.
 *
 * Ashby has no tool that names the signed-in user, so the owner is OpenCode's own sign-in for the alias's MCP server:
 * `ashby:credential:<id>` with the credential's label, and `verified: false`, because Ashby does not confirm it. The
 * probe calls Ashby for nothing, which the manifest says by declaring no operation.
 */
import { PROBE_SCHEMA, parseProbeInput, probeResult } from "@we-the-rebel-alliance/plugin-contract/events"
import { type MethodHandler, RegisterError, refusal } from "@we-the-rebel-alliance/plugin-contract/register"
import type { Provider } from "../provider/index.ts"
import { SOURCE } from "./events.ts"

/** The handler's own input: the source, which is always `ashby`, and nothing else. The register adds `account`. */
export const PROBE_INPUT = {
  type: "object",
  properties: {
    source: { type: "string", description: "The one source this plugin lists; ashby." },
  },
  additionalProperties: false,
} as const

export function createProbeHandler(provider: Provider): MethodHandler {
  return {
    description:
      "Report who is signed in to one Ashby account: OpenCode's sign-in for that account's Ashby MCP server, which Ashby does not confirm. It reads no Ashby content and calls Ashby for nothing.",
    input: PROBE_INPUT,
    output: PROBE_SCHEMA,
    async run(input, call) {
      const parsed = parseProbeInput(input)
      if (!parsed.ok)
        throw new RegisterError(
          refusal("INPUT_INVALID", `the probe input is invalid: ${parsed.problems.join("; ")}`, "Pass only source, as the method's schema describes."),
        )
      if (parsed.value.source !== undefined && parsed.value.source !== SOURCE) {
        throw new RegisterError(refusal("SOURCE_UNKNOWN", `this plugin lists one source, ${SOURCE}`, `Leave source out, or pass "${SOURCE}".`))
      }
      const owner = await provider.owner(call.account)
      return probeResult({ source: SOURCE, account: call.account, owner })
    },
  }
}

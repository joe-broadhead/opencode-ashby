/**
 * The plugin's server entry: one `Plugin.define`, the host gate, the accounts, the handler table and the two skills.
 *
 * `assertHost` refuses an untested OpenCode release before anything is wired. `readSkills` parses each bundled
 * `skills/<id>/SKILL.md` as YAML and throws `SCHEMA_VIOLATION` if one is malformed, so a broken skill fails setup with
 * one clear error. `registerAccounts` adds one Ashby MCP server per alias (`ashby`, `ashby-work`, …), each with its own
 * OAuth. `register` writes doors 1–3 from the one handler table. The plugin installs no per-request hook: it makes no
 * write of its own and receives no webhook, so there is no nudge to emit.
 */
import { Plugin } from "@opencode/plugin"
import { registerAccounts } from "@we-the-rebel-alliance/plugin-contract/accounts"
import { assertHost, register } from "@we-the-rebel-alliance/plugin-contract/register"
import { createHandlers } from "./handlers/index.ts"
import { manifest, version } from "./manifest.ts"
import { createProvider, serverConfig } from "./provider/index.ts"
import { readSkills, registerSkills } from "./skills.ts"

export default Plugin.define({
  id: manifest.plugin.name,
  async setup(ctx) {
    assertHost(ctx, manifest)
    const skills = readSkills()
    const options = ctx.options
    const accounts = await registerAccounts(ctx, { manifest, options, server: () => serverConfig() })
    const provider = createProvider(ctx)
    const handlers = createHandlers({
      manifest,
      options,
      provider,
      context: ctx,
      version,
      hostVersion: ctx.app.version,
      accountProblems: accounts.problems,
    })
    const registration = await register(ctx, manifest, handlers)
    const skillRegistration = await registerSkills(ctx, skills)
    return async () => {
      await skillRegistration.dispose()
      await registration.dispose()
    }
  },
})

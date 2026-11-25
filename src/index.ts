/**
 * The plugin's server entry: one `Plugin.define`, the host gate, the accounts, the handler table and the one tool hook.
 *
 * `assertHost` refuses an untested OpenCode release before anything is wired. `registerAccounts` adds one Ashby MCP
 * server per alias (`ashby`, `ashby-work`, …), each with its own OAuth. `register` writes doors 1–3 from the one handler
 * table and returns the bus writer; the `execute.after` hook is the plugin's only other wiring, and setup returns one
 * cleanup for both.
 */
import { Plugin } from "@opencode/plugin"
import { registerAccounts } from "@we-the-rebel-alliance/plugin-contract/accounts"
import { assertHost, register } from "@we-the-rebel-alliance/plugin-contract/register"
import { installChangedHook } from "./bus.ts"
import { createHandlers } from "./handlers/index.ts"
import { manifest, version } from "./manifest.ts"
import { createProvider, serverConfig } from "./provider/index.ts"
import { loadSkills, registerSkills } from "./skills.ts"

export default Plugin.define({
  id: manifest.plugin.name,
  async setup(context) {
    assertHost(context, manifest)
    const options = context.options
    const { skills, problems: skillProblems } = await loadSkills()
    const accounts = await registerAccounts(context, { manifest, options, server: () => serverConfig() })
    const provider = createProvider(context)
    const handlers = createHandlers({
      manifest,
      options,
      provider,
      context,
      version,
      hostVersion: context.app.version,
      accountProblems: accounts.problems,
      skillProblems,
    })
    const registration = await register(context, manifest, handlers)
    const hook = await installChangedHook(
      context,
      manifest,
      accounts.accounts.map((account) => account.alias),
      registration.bus,
    )
    const skillRegistration = await registerSkills(context.skill, skills)
    return async () => {
      await skillRegistration.dispose()
      await hook.dispose()
      await registration.dispose()
    }
  },
})

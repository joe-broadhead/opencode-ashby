# Repository rules

This repository builds `@we-the-rebel-alliance/ashby-plugin`, an OpenCode plugin that registers Ashby's official MCP
server and adds default permission rules, a status command, a status dialog, two skills, a tools RPC for scripts, and
one source of the shared source contract (`ashby.interviews`). `events_list` and `probe` are also tools in the `ashby`
namespace, so agents and Code Mode reach the same handlers as scripts. Read [docs/architecture.md](docs/architecture.md)
before you change code, and [CONTRIBUTING.md](CONTRIBUTING.md) for the checks and the release steps.

## Rules

- **Public API only.** Use only the public `@opencode/plugin` 2.4.1 API, tested on 2.4.1. `opencode.host` in
  `package.json` and `SUPPORTED_HOST` in `src/constants.ts` both say exactly `>=2.4.1 <2.5.0`, never `^2.4.1`.
  `TESTED_HOSTS` is the one list of tested releases, and the host and pack stages and CI run on each.
- **Greenfield.** No legacy, migration code, compatibility shim, dual path or deprecated alias, and nothing dead.
  Delete rather than deprecate.
- **No peers, no runtime dependencies, no lifecycle scripts.** `@opencode/plugin`, `@opencode/sdk` and
  `@opencode/client` are devDependencies pinned to exactly `2.4.1`; the host supplies `effect`. The source contract,
  `@we-the-rebel-alliance/source-contract`, is a devDependency pinned to one commit, and the build inlines what `src/`
  imports from it into `dist/index.js`.
- **Ship prebuilt, one file per entry.** `scripts/build.mjs` bundles `src/index.ts` and `src/tui.ts` with esbuild into
  the self-contained `dist/index.js` and `dist/tui.js`: no chunks, no relative imports, and only host-provided modules
  external. `tsc` only typechecks.
- **One endpoint string.** `ENDPOINT` in `src/constants.ts` is the only place Ashby's URL is written in code.
- **Default rules, not hooks.** Permissions come from one block, `defaultRules(access)`, inserted through
  `ctx.agent.transform` directly after each agent's base allow. Every tool is allowed by default: `access` is `all`,
  `ask-changes` or `read-only`. Agents that miss the rules are named in status with the per-agent fix, never patched.
- **Transforms are cheap, synchronous and never throw.** Record failures for status instead.
- **Errors** read `CODE: What happened. Next step: What to do.`, built by `ashbyError`, `errorText` or `codeText`.
  `CODES` in `src/constants.ts` is the one table, and the README's `Errors` table is checked equal to it.
- **Status.** `src/status.ts` builds one model for `/ashby-status`, the `/ashby` dialog and the status RPC. It cuts a
  failure's reason to one line of 160 characters with `src/redact.ts`, and names at most 20 unknown tools.
- **The tools RPC.** The transport is the source contract's `tools-rpc` module, shared by the plugin family; never copy
  or patch it here. Ashby's part is `src/tools-rpc.ts`, with every known tool in `src/ashby-tools.ts` by exact name.
  `events_list` and `probe` are registered once in `src/events.ts`; the tool registration in `src/plugin.ts` and the
  RPC method table run the same handlers on the same actions.
- **`src/ashby-tools.ts` is the one record of Ashby's tools**, and has no runtime imports. `test/unit/ashby-tools.json`
  is a raw `tools/list` response; replacing it with a saved one is the whole reconcile, and `npm run drift` reports the
  rest.
- **Candidate data is personal data.** Tests, fixtures, docs and skills use only invented people and companies. The
  skills label Ashby's AI output as Ashby's and never infer protected characteristics or rank candidates.
- **Tests.** Unit tests use narrow `Pick<Plugin.Context, ...>` fakes. Host tests use the public `@opencode/sdk` with
  `OpenCode.create({ app: { version } })`, a loopback fake server and the temp root from `test/host/isolate.ts`. Every
  temp root is a git repository under the system's `/tmp`, and each stock server has its own port. Never sign in to
  Ashby or call its API from a check.
- **One check command.** `npm run check` passes before every commit. Never skip, weaken or delete a test to get green.

## Forbidden in this repository

`scripts/check-forbidden.mjs` enforces the list in `src/`, `test/`, `scripts/` and `dist/`: internal wording and lane
names, the V1 plugin API, `@opencode/ai`, escalating permission hooks, private host source, machine-local home and temp
paths, and `.tsx` or `.jsx` in `dist/`. The pack test also rejects anything in `dist/` other than the two bundles and
any import of a module OpenCode does not provide.

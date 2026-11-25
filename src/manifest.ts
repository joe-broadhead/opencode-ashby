/**
 * The installed package's one manifest, read from the package root.
 *
 * The contract reads `capabilities` from the installed package on disk, validates it strictly and hashes it; this
 * module is the plugin's own copy of that value, so the code and the declaration cannot drift. A broken manifest is a
 * plugin bug, not user data, so it fails at import with the contract's problems.
 */
import { readFileSync } from "node:fs"
import { checkManifest, type Manifest } from "@we-the-rebel-alliance/plugin-contract/manifest"

interface Package {
  readonly version?: unknown
  readonly name?: unknown
  readonly capabilities?: unknown
}

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as Package

const checked = checkManifest(pkg.capabilities)
if (!checked.ok) throw new Error(`ashby: capabilities is not a valid manifest: ${checked.problems.join("; ")}`)

/** The plugin's declared capabilities, validated. */
export const manifest: Manifest = checked.value

/** The installed package's version, for `status`. */
export const version: string = typeof pkg.version === "string" && pkg.version !== "" ? pkg.version : "0.0.0"

/** The installed package's name, which every events page names. */
export const packageName: string = typeof pkg.name === "string" && pkg.name !== "" ? pkg.name : "@we-the-rebel-alliance/ashby-plugin"

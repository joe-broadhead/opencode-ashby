#!/usr/bin/env node
/**
 * The packed tarball: `npm pack`, extract into a temporary directory under the repository, assert the files a person
 * installs, and import the extracted server entry. The entry's `@opencode/*` imports resolve from the repository's
 * node_modules, which is what a host provides at runtime. The temporary directory and the tarball are removed after.
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))))
const stage = join(root, ".pack-test")
let tarball

const fail = (message) => {
  console.error(`pack: ${message}`)
  process.exitCode = 1
}

try {
  rmSync(stage, { recursive: true, force: true })
  mkdirSync(stage, { recursive: true })

  const packed = JSON.parse(execFileSync("npm", ["pack", "--json"], { cwd: root, encoding: "utf8" }))
  tarball = join(root, packed[0].filename)
  execFileSync("tar", ["-xzf", tarball, "-C", stage], { cwd: root })

  const installed = join(stage, "package")
  const required = [
    "package.json",
    "dist/index.js",
    "skills/ashby/SKILL.md",
    "skills/ashby-write/SKILL.md",
    "assets/icon.svg",
    "assets/icon-128.png",
    "assets/icon-256.png",
    "README.md",
    "LICENSE",
    "NOTICE",
  ]
  for (const file of required) {
    if (!existsSync(join(installed, file))) fail(`the packed tarball is missing ${file}`)
  }
  for (const file of ["src/index.ts", "test/unit/manifest.test.ts", "fixtures/conformance.json", "AGENTS.md", "docs/capabilities.md"]) {
    if (existsSync(join(installed, file))) fail(`the packed tarball carries ${file}, which files excludes`)
  }

  const pkg = JSON.parse(readFileSync(join(installed, "package.json"), "utf8"))
  if (pkg.name !== "@we-the-rebel-alliance/ashby-plugin") fail(`the packed package is named ${pkg.name}`)
  if (pkg.version !== "0.0.8") fail(`the packed package is version ${pkg.version}`)
  if (pkg.capabilities?.plugin?.name !== "ashby") fail("the packed package carries no ashby capabilities")
  if (pkg.dependencies !== undefined || pkg.peerDependencies !== undefined) fail("the packed package declares runtime dependencies")

  const entry = await import(pathToFileURL(join(installed, "dist/index.js")).href)
  if (entry.default?.id !== "ashby") fail(`the packed entry exports id ${String(entry.default?.id)}`)
  if (typeof entry.default?.setup !== "function") fail("the packed entry exports no setup function")

  if (process.exitCode === undefined) console.log("pack: ok (the tarball carries dist, skills, assets, README, LICENSE and NOTICE, and its entry imports)")
} catch (error) {
  fail(error instanceof Error ? error.message : String(error))
} finally {
  rmSync(stage, { recursive: true, force: true })
  if (tarball !== undefined) rmSync(tarball, { force: true })
}

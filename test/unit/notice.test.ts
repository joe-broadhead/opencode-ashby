/**
 * The release tarball ships NOTICE next to a bundle that inlines third-party code. This test builds the server entry
 * with the same esbuild options as scripts/build.mjs, collects every package under node_modules that actually ends up
 * in the bundle (including a package already inlined inside a bundled package, such as zod inside plugin-contract), and
 * requires a NOTICE section with that package's verbatim licence text.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { build } from "esbuild"
import { describe, expect, test } from "vitest"

const root = fileURLToPath(new URL("../../", import.meta.url))
const PLUGIN = "@we-the-rebel-alliance/ashby-plugin"

/** A package name from an esbuild input path, or undefined for the plugin's own sources. */
function packageOf(path: string): string | undefined {
  return /^node_modules\/((?:@[^/]+\/)?[^/]+)\//.exec(path)?.[1]
}

function keep(name: string | undefined): name is string {
  return name !== undefined && name !== PLUGIN && !name.startsWith("@opencode/") && !name.startsWith(".")
}

/** Every package esbuild actually inlines into the server bundle. */
async function bundledPackages(): Promise<string[]> {
  const result = await build({
    absWorkingDir: root,
    entryPoints: [{ in: join(root, "src", "index.ts"), out: "index" }],
    outdir: join(root, ".notice-test"),
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
    target: "node24",
    external: ["@opencode/*"],
    legalComments: "none",
    metafile: true,
    logLevel: "silent",
  })
  const found = new Set<string>()
  const inputs = Object.keys(result.metafile.inputs)
  for (const path of inputs) {
    const name = packageOf(path)
    if (keep(name)) found.add(name)
  }
  // A bundled package can already contain its own dependencies; their original module path appears in a comment.
  for (const path of inputs) {
    if (!path.startsWith("node_modules/")) continue
    const text = readFileSync(join(root, path), "utf8")
    for (const match of text.matchAll(/\/\/\s*node_modules\/((?:@[^/\s]+\/)?[^/\s]+)\//g)) {
      if (keep(match[1])) found.add(match[1])
    }
  }
  return [...found].sort()
}

function heading(name: string, version: string, license: string): string {
  return `## ${name} ${version} (${license})`
}

describe("the bundled third-party notices", () => {
  test("every inlined package has its heading and verbatim licence text", async () => {
    const packages = await bundledPackages()
    expect(packages).toEqual(expect.arrayContaining(["@we-the-rebel-alliance/plugin-contract", "yaml", "zod"]))
    const notice = readFileSync(join(root, "NOTICE"), "utf8")
    for (const name of packages) {
      const pkg = JSON.parse(readFileSync(join(root, "node_modules", name, "package.json"), "utf8")) as {
        readonly version: string
        readonly license: string
      }
      const text = readFileSync(join(root, "node_modules", name, "LICENSE"), "utf8").trim()
      expect(notice, `${name} heading`).toContain(heading(name, pkg.version, pkg.license))
      expect(notice, `${name} licence text`).toContain(text)
    }
  })
})

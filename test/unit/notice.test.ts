/**
 * The release tarball ships NOTICE next to a bundle that inlines third-party code. This test builds the server entry
 * with the same esbuild options as scripts/build.mjs, collects every package the bundle actually carries, and requires
 * a NOTICE heading and that package's verbatim licence text.
 *
 * Two packages never show up as their own top-level inputs: every plugin inlines plugin-contract, and plugin-contract's
 * dist already carries zod. They are required explicitly, and their code is looked for in the emitted bundle rather
 * than in the metafile.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { build } from "esbuild"
import { describe, expect, test } from "vitest"

const root = fileURLToPath(new URL("../../", import.meta.url))
const PLUGIN = "@we-the-rebel-alliance/ashby-plugin"
const CONTRACT = "@we-the-rebel-alliance/plugin-contract"

/** Packages the bundle always carries, with a marker from their code in the emitted bundle. */
const ALWAYS_INLINED: readonly { readonly name: string; readonly marker: RegExp }[] = [
  { name: CONTRACT, marker: /assertPluginName\b|\bmanifestHash\b/ },
  { name: "zod", marker: /\$ZodType\b|\bZodError\b/ },
]

/** A package name from an esbuild input path, or undefined for the plugin's own sources. */
function packageOf(path: string): string | undefined {
  return /^node_modules\/((?:@[^/]+\/)?[^/]+)\//.exec(path)?.[1]
}

function keep(name: string | undefined): name is string {
  return name !== undefined && name !== PLUGIN && !name.startsWith("@opencode/") && !name.startsWith(".")
}

interface Package {
  readonly name: string
  readonly version: string
  readonly license: string
  readonly text: string
}

function packageInfo(name: string): Package {
  const directory = join(root, "node_modules", name)
  const pkg = JSON.parse(readFileSync(join(directory, "package.json"), "utf8")) as {
    readonly version: string
    readonly license: string
  }
  return {
    name,
    version: pkg.version,
    license: pkg.license,
    text: readFileSync(join(directory, "LICENSE"), "utf8").trimEnd(),
  }
}

function heading(name: string, version: string, license: string): string {
  return `## ${name} ${version} (${license})`
}

function missingNoticeSections(notice: string, packages: readonly Package[]): string[] {
  return packages.filter((pkg) => !notice.includes(heading(pkg.name, pkg.version, pkg.license)) || !notice.includes(pkg.text)).map((pkg) => pkg.name)
}

/** The notice with one section removed, heading through the last line before the next heading. */
function withoutSection(notice: string, name: string): string {
  const start = notice.indexOf(`## ${name} `)
  if (start < 0) return notice
  const next = notice.indexOf("\n## ", start)
  return notice.slice(0, start) + (next < 0 ? "" : notice.slice(next + 1))
}

/** Every package the emitted server bundle carries, including the two that the metafile alone does not name. */
async function bundledPackages(): Promise<Package[]> {
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
  const bundle = (result.outputFiles ?? []).map((file) => file.text).join("\n")
  const names = new Set<string>()
  for (const path of Object.keys(result.metafile.inputs)) {
    const name = packageOf(path)
    if (keep(name)) names.add(name)
  }
  for (const { name, marker } of ALWAYS_INLINED) {
    expect(bundle, `${name} code is in the bundle`).toMatch(marker)
    names.add(name)
  }
  return [...names].sort().map(packageInfo)
}

describe("the bundled third-party notices", () => {
  test("every inlined package has its heading and verbatim licence text", async () => {
    const packages = await bundledPackages()
    expect(packages.map((pkg) => pkg.name)).toEqual(expect.arrayContaining([CONTRACT, "yaml", "zod"]))
    const notice = readFileSync(join(root, "NOTICE"), "utf8")
    expect(missingNoticeSections(notice, packages)).toEqual([])
  })

  test("a missing package section is reported", () => {
    const notice = readFileSync(join(root, "NOTICE"), "utf8")
    expect(missingNoticeSections(withoutSection(notice, "zod"), [packageInfo("zod")])).toEqual(["zod"])
    expect(missingNoticeSections(withoutSection(notice, CONTRACT), [packageInfo(CONTRACT)])).toEqual([CONTRACT])
  })
})

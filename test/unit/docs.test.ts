/**
 * Install docs name one release: `#v<the installed version>`. A concrete tag that is not the release being prepared is
 * a drift finding, and an untagged install (`#master`) is refused. The generated sections are the kit's; this guard is
 * the install spec's.
 */
import { readFileSync } from "node:fs"
import { describe, expect, test } from "vitest"
import { version } from "../../src/manifest.ts"

const DOCS = ["README.md", "docs/configuration.md", "docs/accounts.md", "CONTRIBUTING.md", "AGENTS.md"]

const text = (file: string) => readFileSync(new URL(`../../${file}`, import.meta.url), "utf8")

describe("install docs", () => {
  test("name only the release being prepared, and at least one install spec", () => {
    const tags = new Set<string>()
    for (const file of DOCS) {
      for (const match of text(file).matchAll(/#v(\d+\.\d+\.\d+)/g)) tags.add(match[1]!)
      expect({ file, untagged: /ashby-plugin#(?:master|main)\b/.test(text(file)) }).toEqual({ file, untagged: false })
    }
    expect([...tags]).toEqual([version])
  })

  test("README carries one install command and one config example at the released tag", () => {
    const readme = text("README.md")
    expect(readme).toContain(`opencode plugin add github:we-the-rebel-alliance/ashby-plugin#v${version}`)
    expect(readme).toContain(`"package": "github:we-the-rebel-alliance/ashby-plugin#v${version}"`)
    expect(readme).not.toContain("#v<version>")
  })
})

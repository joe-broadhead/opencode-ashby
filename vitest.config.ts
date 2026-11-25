import { defineConfig } from "vitest/config"

/**
 * The two host suites each boot a real embedded OpenCode 2.4.1 host. Run in parallel they starve each other and hit the
 * 60 s test timeout, so every file runs one at a time.
 */
export default defineConfig({
  test: {
    fileParallelism: false,
  },
})

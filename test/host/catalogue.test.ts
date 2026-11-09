import { afterAll, expect, test } from "bun:test"
import * as z from "zod"
import { cleanup, startHost, until } from "./harness.js"

test("the forced Ashby catalogue stays under 1,000 tokens", async () => {
  let captured = "", lastSystem = ""
  const mock = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    async fetch(request) {
      const body = await request.json() as { messages?: { role: string; content?: unknown }[] }
      const system = (body.messages ?? []).filter(item => item.role === "system").map(item => typeof item.content === "string" ? item.content : "").join("\n")
      lastSystem = system
      if (system.includes("- ashby (")) captured = system
      const chunk = (delta: Record<string, unknown>, finish: string | null = null) =>
        `data: ${JSON.stringify({ id: "mock", object: "chat.completion.chunk", created: 0, model: "m1", choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`
      return new Response(`${chunk({ role: "assistant", content: "ok" })}${chunk({}, "stop")}data: [DONE]\n\n`, { headers: { "content-type": "text/event-stream" } })
    },
  })
  let host: Awaited<ReturnType<typeof startHost>> | undefined
  try {
    host = await startHost({ config: () => ({
      providers: { scripted: { name: "Scripted", package: ["@opencode", "ai", "providers", "openai-compatible"].join("/"), settings: { baseURL: `http://127.0.0.1:${mock.port}/v1`, apiKey: "test" }, models: { m1: { name: "Mock", capabilities: { tools: true } } } } },
      model: "scripted/m1",
    }) })
    await until("the Ashby tools to register", async () => (await host!.probe().tool.list()).some(tool => tool.id === "ashby_search_records_by_name"))
    const filler = await host.probe().tool.transform(editor => {
      editor.namespace({ name: "filler", description: "Spends the inline budget." })
      editor.add({ name: "pad", description: "pad", input: z.object({ note: z.string().describe("x".repeat(9000)) }), options: { namespace: "filler", permission: "filler_pad", pinned: true }, execute: async () => ({ content: "ok" }) } as never)
    })
    try {
      const session = await host.client.session.create({ location: host.location, agent: "build" } as never)
      await host.client.session.prompt({ sessionID: session.id, text: "Reply with ok." } as never)
      const deadline = Date.now() + 30_000
      while (!captured.includes("- ashby (") && Date.now() < deadline) await Bun.sleep(50)
      const lines = captured.split("\n"), start = lines.findIndex(line => line.startsWith("- ashby ("))
      const section = start < 0 ? [] : [lines[start]!]
      for (let i = start + 1; start >= 0 && i < lines.length && lines[i]!.startsWith("  "); i++) section.push(lines[i]!)
      const text = section.join("\n")
      expect(text.startsWith("- ashby ("), lastSystem.slice(0, 2000)).toBe(true)
      expect(Math.round(text.length / 4)).toBeLessThanOrEqual(1000)
    } finally { await filler.dispose() }
  } finally {
    await host?.close()
    mock.stop(true)
  }
}, 120_000)

afterAll(() => cleanup())

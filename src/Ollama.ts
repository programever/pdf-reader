import { checkForRepeatEvery, elapsedSeconds, failed, isRecord, linesOf, repeatsItself, type Asked, type RunnerVersion } from "./Runner.ts"

export const ollamaUrl = "http://127.0.0.1:11435"

export type Options = {
  temperature: number
  seed: number
  num_ctx: number
  num_predict: number
}

export type Question = {
  model: string
  prompt: string
  images: Buffer[]
  options: Options
  think?: boolean
  format?: object
}

export async function ask(question: Question): Promise<Asked> {
  const startedAt = new Date()
  const stop = new AbortController()
  const response = await fetch(`${ollamaUrl}/api/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal: stop.signal,
    body: JSON.stringify({
      model: question.model,
      prompt: question.prompt,
      images: question.images.map((image) => image.toString("base64")),
      options: question.options,
      think: question.think,
      format: question.format,
      // Node's fetch gives up when no byte arrives for 5 minutes. A streamed answer sends bytes all the time.
      stream: true,
    }),
  })
  if (!response.ok) throw new Error(`Ollama answered ${response.status}: ${await response.text()}`)

  let text = ""
  let thinking = ""
  let pieces = 0
  let last: Record<string, unknown> = {}
  for await (const line of linesOf(response)) {
    const value: unknown = JSON.parse(line)
    if (!isRecord(value)) throw new Error(`Ollama sent a line that is not an object: ${line}`)
    last = value
    if (typeof value.response === "string") text += value.response
    if (typeof value.thinking === "string") thinking += value.thinking
    pieces += 1
    if (pieces % checkForRepeatEvery === 0 && (repeatsItself(text) || repeatsItself(thinking))) {
      stop.abort()
      return failed("the answer repeats itself")
    }
  }

  if (typeof last.error === "string") return failed(`Ollama stopped the model: ${last.error}`)
  if (last.done !== true) return failed("the answer has no normal end")
  if (last.done_reason !== "stop") return failed(`the answer was cut off (${String(last.done_reason)}) at num_predict = ${question.options.num_predict}`)
  if (typeof last.prompt_eval_count !== "number" || typeof last.eval_count !== "number") return failed("Ollama did not report the tokens")
  return {
    ok: true,
    answer: {
      text,
      thinking: thinking === "" ? null : thinking,
      startedAt: startedAt.toISOString(),
      seconds: elapsedSeconds(startedAt),
      inputTokens: last.prompt_eval_count,
      outputTokens: last.eval_count,
      contextLimit: question.options.num_ctx,
    },
  }
}

export async function ollamaVersion(): Promise<RunnerVersion> {
  const body = await getJson("/api/version")
  if (!isRecord(body) || typeof body.version !== "string") throw new Error("Ollama did not say its version.")
  return { name: "ollama", version: body.version }
}

export async function requireModel(model: string): Promise<void> {
  const body = await getJson("/api/tags")
  const names = isRecord(body) && Array.isArray(body.models) ? body.models.map((entry) => (isRecord(entry) ? entry.name : null)) : []
  if (!names.includes(model)) {
    throw new Error(`The model ${model} is not in models/. Download it first: npm run ollama:pull ${model}`)
  }
}

async function getJson(path: string): Promise<unknown> {
  const response = await fetch(`${ollamaUrl}${path}`).catch(() => null)
  if (response === null || !response.ok) {
    throw new Error(`Our Ollama server does not answer at ${ollamaUrl}. Start it in another terminal tab: npm run ollama:start`)
  }
  return response.json()
}

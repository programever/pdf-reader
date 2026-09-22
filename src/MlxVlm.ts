import { readFile } from "node:fs/promises"
import { checkForRepeatEvery, elapsedSeconds, failed, isRecord, linesOf, repeatsItself, type Asked, type RunnerVersion } from "./Runner.ts"

export const mlxVlmUrl = "http://127.0.0.1:11436"

export type Options = {
  temperature: number
  top_p: number
  top_k: number
  repetition_penalty: number
  seed: number
  max_tokens: number
}

export type Question = {
  model: string
  prompt: string
  images: Buffer[]
  options: Options
}

export async function ask(question: Question): Promise<Asked> {
  const contextLimit = await requireModel(question.model)
  const startedAt = new Date()
  const stop = new AbortController()
  const pictures = question.images.map((image) => ({ type: "image_url", image_url: { url: `data:image/png;base64,${image.toString("base64")}` } }))
  const response = await fetch(`${mlxVlmUrl}/v1/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal: stop.signal,
    body: JSON.stringify({
      model: question.model,
      // The makers of glm-ocr send the picture first and the prompt after it (glmocr/dataloader/page_loader.py in their repo).
      messages: [{ role: "user", content: [...pictures, { type: "text", text: question.prompt }] }],
      ...question.options,
      stream: true,
      stream_options: { include_usage: true },
    }),
  })
  if (!response.ok) throw new Error(`mlx-vlm answered ${response.status}: ${await response.text()}`)

  let text = ""
  let pieces = 0
  let finishReason: unknown = null
  let usage: unknown = null
  for await (const line of linesOf(response)) {
    if (!line.startsWith("data: ") || line === "data: [DONE]") continue
    const value: unknown = JSON.parse(line.slice("data: ".length))
    if (!isRecord(value)) throw new Error(`mlx-vlm sent a line that is not an object: ${line}`)
    if (isRecord(value.usage)) usage = value.usage
    const choice = Array.isArray(value.choices) ? value.choices[0] : undefined
    if (!isRecord(choice)) continue
    if (choice.finish_reason !== null && choice.finish_reason !== undefined) finishReason = choice.finish_reason
    if (isRecord(choice.delta) && typeof choice.delta.content === "string") text += choice.delta.content
    pieces += 1
    if (pieces % checkForRepeatEvery === 0 && repeatsItself(text)) {
      stop.abort()
      return failed("the answer repeats itself")
    }
  }

  if (finishReason === null) return failed("the answer has no normal end")
  if (finishReason !== "stop") return failed(`the answer was cut off (${String(finishReason)}) at max_tokens = ${question.options.max_tokens}`)
  if (!isRecord(usage) || typeof usage.prompt_tokens !== "number" || typeof usage.completion_tokens !== "number") {
    return failed("mlx-vlm did not report the tokens")
  }
  return {
    ok: true,
    answer: {
      text,
      thinking: null,
      startedAt: startedAt.toISOString(),
      seconds: elapsedSeconds(startedAt),
      inputTokens: usage.prompt_tokens,
      outputTokens: usage.completion_tokens,
      contextLimit,
    },
  }
}

export async function mlxVlmVersion(): Promise<RunnerVersion> {
  const lock = await readFile(new URL("../runners/mlx-vlm/uv.lock", import.meta.url), "utf8")
  const version = /name = "mlx-vlm"\nversion = "([^"]+)"/.exec(lock)?.[1]
  if (version === undefined) throw new Error("The version of mlx-vlm is not in runners/mlx-vlm/uv.lock.")
  return { name: "mlx-vlm", version }
}

export async function requireModel(model: string): Promise<number> {
  const response = await fetch(`${mlxVlmUrl}/health`).catch(() => null)
  if (response === null || !response.ok) {
    throw new Error(`The mlx-vlm server does not answer at ${mlxVlmUrl}. Start it in another terminal tab: npm run mlx:start`)
  }
  const health: unknown = await response.json()
  if (isRecord(health) && health.loaded_model === model && typeof health.effective_context_limit === "number") {
    return health.effective_context_limit
  }

  // The server loads a model when the first question for it arrives, and only then knows the context limit of that model.
  const loaded = await fetch(`${mlxVlmUrl}/v1/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model, messages: [{ role: "user", content: "." }], max_tokens: 1 }),
  })
  if (!loaded.ok) {
    throw new Error(`mlx-vlm cannot load ${model} (${loaded.status}). Download it first: npm run mlx:pull ${model}\n${await loaded.text()}`)
  }
  const after: unknown = await (await fetch(`${mlxVlmUrl}/health`)).json()
  if (!isRecord(after) || typeof after.effective_context_limit !== "number") throw new Error("mlx-vlm did not say the context limit of the model.")
  return after.effective_context_limit
}

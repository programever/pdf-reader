export type RunnerVersion = {
  name: string
  version: string
}

export type Answer = {
  text: string
  thinking: string | null
  startedAt: string
  seconds: number
  inputTokens: number
  outputTokens: number
  contextLimit: number
}

export type Asked = { ok: true; answer: Answer } | { ok: false; reason: string }

export function failed(reason: string): Asked {
  return { ok: false, reason }
}

const repeatedLetters = 400
const repeats = 8
const longestBlock = 300
export const checkForRepeatEvery = 40

export function repeatsItself(text: string): boolean {
  for (let block = 1; block <= longestBlock; block++) {
    const span = Math.max(repeatedLetters, block * repeats)
    if (text.length < span + block) continue
    const tail = text.slice(-span)
    const before = text.slice(-span - block, -block)
    if (tail === before) return true
  }
  return false
}

export function elapsedSeconds(startedAt: Date): number {
  return Math.round((Date.now() - startedAt.getTime()) / 1000)
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export async function* linesOf(response: Response): AsyncGenerator<string> {
  if (response.body === null) return
  let rest = ""
  for await (const chunk of response.body.pipeThrough(new TextDecoderStream())) {
    const lines = (rest + chunk).split("\n")
    rest = lines.pop() ?? ""
    for (const line of lines) if (line.trim() !== "") yield line
  }
  if (rest.trim() !== "") yield rest
}

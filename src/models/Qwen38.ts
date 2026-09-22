import { ask, ollamaVersion, requireModel, type Options } from "../Ollama.ts"
import type { ValueAnswer, ValueModel, ValueSetting } from "../ValueModel.ts"

type Setting = ValueSetting & {
  think: boolean
  readContext: string
  workOutContext: string
  options: Options
}

const readContext = [
  "Below is the text of one page of an insurance illustration, an instruction, and the values that were found before.",
  "Find the value that the instruction names on this page. Answer with the value exactly the way the page writes it, with its currency sign, commas and decimals.",
  "If the value is not on this page, answer null. Do not guess.",
].join("\n")

const workOutContext = [
  "Below is an instruction with a formula, and the values that were found before.",
  "Work out the value of the formula from these values. Answer with the result only.",
  "If a value that the formula needs is missing or null, answer null. Do not guess.",
].join("\n")

// Ollama makes the model answer in this shape, so the answer is never a sentence around the value.
const answerShape = {
  type: "object",
  properties: { value: { type: ["string", "null"] } },
  required: ["value"],
}

export const valueModel: ValueModel<Setting> = {
  settings: [
    {
      name: "ollama-qwen3.8-27b",
      model: "qwen3.8:27b",
      think: false,
      readContext,
      workOutContext,
      options: { temperature: 0, seed: 1, num_ctx: 16384, num_predict: 1000 },
    },
  ],

  requireReady: (setting) => requireModel(setting.model),

  runner: ollamaVersion,

  readValue: (setting, question) =>
    answer(setting, `${setting.readContext}\n\nValues found before:\n${question.valuesSoFar}\n\nInstruction:\n${question.instruction}\n\nText of the page:\n${question.pageText}`),

  workOut: (setting, question) =>
    answer(setting, `${setting.workOutContext}\n\nValues found before:\n${question.valuesSoFar}\n\nInstruction:\n${question.instruction}`),
}

async function answer(setting: Setting, prompt: string): Promise<ValueAnswer> {
  const asked = await ask({ model: setting.model, prompt, images: [], options: setting.options, think: setting.think, format: answerShape })
  if (!asked.ok) return { failed: asked.reason }

  const { text, ...facts } = asked.answer
  const parsed = valueIn(text)
  if (parsed === undefined) return { failed: `the answer is not in the agreed shape: ${text.slice(0, 200)}` }
  return { value: parsed, call: { ...facts, answer: parsed } }
}

function valueIn(text: string): string | null | undefined {
  try {
    const parsed: unknown = JSON.parse(text)
    if (typeof parsed !== "object" || parsed === null || !("value" in parsed)) return undefined
    return typeof parsed.value === "string" || parsed.value === null ? parsed.value : undefined
  } catch {
    return undefined
  }
}

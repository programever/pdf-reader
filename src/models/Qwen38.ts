import { ask, ollamaVersion, requireModel, type Options } from "../Ollama.ts"
import type { ValueAnswer, ValueModel, ValueSetting } from "../ValueModel.ts"

type Setting = ValueSetting & {
  think: boolean
  readContext: string
  workOutContext: string
  options: Options
}

const readContext = [
  "Below is the text of one page of an insurance illustration, then the values that were found before, an instruction, and an example of the form of the answer.",
  "Find the value that the instruction names on this page.",
  "Answer with the value only, in the same form as the example. The example shows the form of the answer. It is not the answer.",
  "Write no explanation.",
  "If the value is not on this page, answer null. Do not guess.",
].join("\n")

const workOutContext = [
  "Below is an instruction with a formula, the values that were found before, and an example of the form of the answer.",
  "Work out the value of the formula from these values.",
  "Answer with the result only, in the same form as the example. The example shows the form of the answer. It is not the answer.",
  "Write no explanation.",
  "If a value that the formula needs is missing or null, answer null. Do not guess.",
].join("\n")

export const valueModel: ValueModel<Setting> = {
  settings: [
    {
      // The makers' numbers for thinking mode, read on 2026-09-22: https://huggingface.co/Qwen/Qwen3.8-27B
      name: "ollama-qwen3.8-27b-thinking-pagefirst-with-example",
      model: "qwen3.8:27b",
      think: true,
      readContext,
      workOutContext,
      options: { temperature: 1, top_p: 0.95, top_k: 20, min_p: 0, seed: 1, num_ctx: 32768, num_predict: 8192 },
    },
  ],

  requireReady: (setting) => requireModel(setting.model),

  runner: ollamaVersion,

  // The page comes right after the fixed context: Ollama keeps its notes on an input it has read and reuses them
  // when the next input starts the same way, so the questions on one page share the reading of that page.
  readValue: (setting, question) =>
    answer(
      setting,
      `${setting.readContext}\n\nText of the page:\n${question.pageText}\n\nValues found before:\n${question.valuesSoFar}\n\nInstruction:\n${question.instruction}\n\nExample of the form of the answer, not the answer:\n${question.example}`,
    ),

  workOut: (setting, question) =>
    answer(
      setting,
      `${setting.workOutContext}\n\nValues found before:\n${question.valuesSoFar}\n\nInstruction:\n${question.instruction}\n\nExample of the form of the answer, not the answer:\n${question.example}`,
    ),
}

async function answer(setting: Setting, prompt: string): Promise<ValueAnswer> {
  const asked = await ask({ model: setting.model, prompt, images: [], options: setting.options, think: setting.think })
  if (!asked.ok) return { failed: asked.reason }
  const { text, ...facts } = asked.answer
  const trimmed = text.trim()
  const value = trimmed.toLowerCase() === "null" ? null : trimmed
  return { value, call: { ...facts, answer: value, prompt } }
}

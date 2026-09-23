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

// The makers' numbers for thinking mode on general tasks, read on 2026-09-23: https://huggingface.co/Qwen/Qwen3.5-9B
const makers = { temperature: 1, top_p: 0.95, top_k: 20, min_p: 0, presence_penalty: 1.5, seed: 1 }

export const valueModel: ValueModel<Setting> = {
  settings: [
    {
      name: "ollama-qwen3.5-9b-thinking",
      model: "qwen3.5:9b",
      think: true,
      readContext,
      workOutContext,
      options: { ...makers, num_ctx: 32768, num_predict: 8192 },
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
  const asked = await ask({ model: setting.model, prompt, images: [], options: setting.options, think: setting.think })
  if (!asked.ok) return { failed: asked.reason }
  const { text, ...facts } = asked.answer
  const trimmed = text.trim()
  const value = trimmed.toLowerCase() === "null" ? null : trimmed
  return { value, call: { ...facts, answer: value, prompt } }
}

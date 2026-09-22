import { ask, mlxVlmVersion, requireModel, type Options } from "../MlxVlm.ts"
import type { PageReading, TextModel, TextSetting } from "../TextModel.ts"

// The makers' guide: https://huggingface.co/ibm-granite/granite-docling-258M (the "Quickstart" part), and their own
// files for Apple chips. One question for a whole page, temperature 0, up to 8192 tokens. The model does not write
// Markdown. It writes DocTags, its own tag format, which IBM's Docling tool turns into Markdown.
type Setting = TextSetting & {
  prompt: string
  options: Options
}

const model = "ibm-granite/granite-docling-258M-mlx"

const prompt = "Convert this page to docling."

// The makers name temperature 0 and 8192 tokens. The other three are the neutral values, the same as the other OCR
// settings, so all OCR models pick the same way.
const options: Options = { temperature: 0, top_p: 1, top_k: 0, repetition_penalty: 1, seed: 1, max_tokens: 8192 }

export const textModel: TextModel<Setting> = {
  settings: [{ name: "mlx-granitedocling-258m", model, dpi: 200, prompt, options }],

  requireReady: async (setting) => {
    await requireModel(setting.model)
  },

  runner: mlxVlmVersion,

  async readPage(setting, picture): Promise<PageReading> {
    const asked = await ask({ model: setting.model, prompt: setting.prompt, images: [picture], options: setting.options })
    if (!asked.ok) return { failed: asked.reason }
    const { text, ...facts } = asked.answer
    return { text: text.trim(), calls: [{ prompt: setting.prompt, ...facts }] }
  },
}

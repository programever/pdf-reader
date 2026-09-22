import { ask, mlxVlmVersion, requireModel, type Options } from "../MlxVlm.ts"
import type { Call, PageReading, TextModel, TextSetting } from "../TextModel.ts"

// The makers' guide for a Mac: https://github.com/zai-org/GLM-OCR/blob/main/examples/mlx-deploy/README.md
// The model has no "read the whole page" prompt. It knows only these fixed prompts, one for each kind of content
// (https://huggingface.co/zai-org/GLM-OCR). The makers' own toolkit cuts a page into pieces first and sends each piece
// with the fitting prompt; sending a whole page is our use, not theirs.
type Prompt = "Text Recognition:" | "Table Recognition:" | "Formula Recognition:"

type Setting = TextSetting & {
  prompts: Prompt[]
  options: Options
}

const model = "mlx-community/GLM-OCR-bf16"

// The makers' values: https://github.com/zai-org/GLM-OCR/blob/main/glmocr/config.yaml
const options: Options = { temperature: 0, top_p: 0.00001, top_k: 1, repetition_penalty: 1.1, seed: 1, max_tokens: 8192 }

export const textModel: TextModel<Setting> = {
  settings: [
    { name: "mlx-glm-bf16", model, dpi: 200, prompts: ["Text Recognition:", "Table Recognition:"], options },
  ],

  requireReady: async (setting) => {
    await requireModel(setting.model)
  },

  runner: mlxVlmVersion,

  async readPage(setting, picture): Promise<PageReading> {
    const texts: string[] = []
    const calls: Call[] = []
    for (const prompt of setting.prompts) {
      const asked = await ask({ model: setting.model, prompt, images: [picture], options: setting.options })
      if (!asked.ok) return { failed: `${prompt} ${asked.reason}` }
      const { text, ...facts } = asked.answer
      texts.push(text.trim())
      calls.push({ prompt, ...facts })
    }
    return { text: texts.filter((text) => text !== "").join("\n\n"), calls }
  },
}

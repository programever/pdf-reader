import { ask, mlxVlmVersion, requireModel, type Options } from "../MlxVlm.ts"
import type { PageReading, TextModel, TextSetting } from "../TextModel.ts"

// The makers' guide: https://huggingface.co/ATH-MaaS/OvisOCR2 (the "Inference" part). One prompt for a whole page,
// sent after the picture, temperature 0, at most 16384 tokens. The makers name vLLM as the runner, not mlx-vlm.
type Setting = TextSetting & {
  prompt: string
  options: Options
}

const model = "ATH-MaaS/OvisOCR2"

const prompt =
  '\nExtract all readable content from the image in natural human reading order and output the result as a single Markdown document. For charts or images, represent them using an HTML image tag: <img src="images/bbox_{left}_{top}_{right}_{bottom}.jpg" />, where left, top, right, bottom are bounding box coordinates scaled to [0, 1000). Format formulas as LaTeX. Format tables as HTML: <table>...</table>. Transcribe all other text as standard Markdown. Preserve the original text without translation or paraphrasing.'

// The makers set only temperature and max_tokens; the other three are the neutral values that change nothing.
const options: Options = { temperature: 0, top_p: 1, top_k: 0, repetition_penalty: 1, seed: 1, max_tokens: 16384 }

export const textModel: TextModel<Setting> = {
  settings: [{ name: "mlx-ovisocr2-bf16", model, dpi: 200, prompt, options }],

  requireReady: async (setting) => {
    await requireModel(setting.model)
  },

  runner: mlxVlmVersion,

  async readPage(setting, picture): Promise<PageReading> {
    const asked = await ask({ model: setting.model, prompt: setting.prompt, images: [picture], options: setting.options })
    if (!asked.ok) return { failed: asked.reason }
    const { text, ...facts } = asked.answer
    return { text: withoutPictureTags(text.trim()), calls: [{ prompt: setting.prompt, ...facts }] }
  },
}

// The makers' own parse() drops these tags by default (filter_imgtags=True): they only point at a region of the page.
function withoutPictureTags(text: string): string {
  return text
    .split("\n\n")
    .filter((block) => !block.trim().startsWith('<img src="images/bbox_'))
    .join("\n\n")
}

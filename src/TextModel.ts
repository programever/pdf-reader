import type { RunnerVersion } from "./Runner.ts"
import { allModels, noSuchSetting } from "./Settings.ts"

export type TextSetting = {
  name: string
  model: string
  dpi: number
}

export type Call = {
  prompt: string
  startedAt: string
  seconds: number
  inputTokens: number
  outputTokens: number
  contextLimit: number
}

export type PageReading = { text: string; calls: Call[] } | { failed: string }

export type TextModel<Setting extends TextSetting = TextSetting> = {
  settings: Setting[]
  requireReady(setting: Setting): Promise<void>
  runner(): Promise<RunnerVersion>
  readPage(setting: Setting, picture: Buffer): Promise<PageReading>
}

export type ChosenTextModel = {
  setting: TextSetting
  requireReady(): Promise<void>
  runner(): Promise<RunnerVersion>
  readPage(picture: Buffer): Promise<PageReading>
}

export async function chooseTextModel(settingName: string): Promise<ChosenTextModel> {
  const { textModels } = await allModels()
  for (const model of textModels) {
    const setting = model.settings.find((candidate) => candidate.name === settingName)
    if (setting !== undefined) {
      return {
        setting,
        requireReady: () => model.requireReady(setting),
        runner: () => model.runner(),
        readPage: (picture) => model.readPage(setting, picture),
      }
    }
  }
  throw noSuchSetting(
    settingName,
    textModels.flatMap((model) => model.settings.map((setting) => setting.name)),
  )
}

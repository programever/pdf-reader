import type { RunnerVersion } from "./Runner.ts"
import { allModels, noSuchSetting } from "./Settings.ts"

export type ValueSetting = {
  name: string
  model: string
}

export type ValueCall = {
  prompt: string
  startedAt: string
  seconds: number
  inputTokens: number
  outputTokens: number
  contextLimit: number
  thinking: string | null
  answer: string | null
}

export type ValueAnswer = { value: string | null; call: ValueCall } | { failed: string }

export type ReadQuestion = {
  pageText: string
  instruction: string
  valuesSoFar: string
  example: string
}

export type WorkOutQuestion = {
  instruction: string
  valuesSoFar: string
  example: string
}

export type ValueModel<Setting extends ValueSetting = ValueSetting> = {
  settings: Setting[]
  requireReady(setting: Setting): Promise<void>
  runner(): Promise<RunnerVersion>
  readValue(setting: Setting, question: ReadQuestion): Promise<ValueAnswer>
  workOut(setting: Setting, question: WorkOutQuestion): Promise<ValueAnswer>
}

export type ChosenValueModel = {
  setting: ValueSetting
  requireReady(): Promise<void>
  runner(): Promise<RunnerVersion>
  readValue(question: ReadQuestion): Promise<ValueAnswer>
  workOut(question: WorkOutQuestion): Promise<ValueAnswer>
}

export async function chooseValueModel(settingName: string): Promise<ChosenValueModel> {
  const { valueModels } = await allModels()
  for (const model of valueModels) {
    const setting = model.settings.find((candidate) => candidate.name === settingName)
    if (setting !== undefined) {
      return {
        setting,
        requireReady: () => model.requireReady(setting),
        runner: () => model.runner(),
        readValue: (question) => model.readValue(setting, question),
        workOut: (question) => model.workOut(setting, question),
      }
    }
  }
  throw noSuchSetting(
    settingName,
    valueModels.flatMap((model) => model.settings.map((setting) => setting.name)),
  )
}

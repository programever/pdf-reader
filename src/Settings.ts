import { readdir } from "node:fs/promises"
import type { TextModel } from "./TextModel.ts"
import type { ValueModel } from "./ValueModel.ts"

type ModelFile = { textModel?: TextModel; valueModel?: ValueModel }

export type AllModels = {
  textModels: TextModel[]
  valueModels: ValueModel[]
}

export async function allModels(): Promise<AllModels> {
  const folder = new URL("./models/", import.meta.url)
  const files = (await readdir(folder)).filter((file) => file.endsWith(".ts")).sort()
  const modelFiles: ModelFile[] = await Promise.all(files.map((file) => import(new URL(file, folder).href)))
  const models = {
    textModels: modelFiles.flatMap((file) => (file.textModel === undefined ? [] : [file.textModel])),
    valueModels: modelFiles.flatMap((file) => (file.valueModel === undefined ? [] : [file.valueModel])),
  }

  const names = [...models.textModels, ...models.valueModels].flatMap((model) => model.settings.map((setting) => setting.name))
  const problems = names.flatMap((name) => nameProblems(name, names))
  if (problems.length > 0) throw new Error([...new Set(problems)].join("\n"))
  return models
}

export function noSuchSetting(name: string, names: string[]): Error {
  return new Error(`There is no setting named "${name}". The settings are:\n${names.map((known) => `  ${known}`).join("\n")}`)
}

function nameProblems(name: string, all: string[]): string[] {
  return [
    // A result file of a run is named <ocr setting>_<value setting>-<run number>.json, so "_" must stay free for that.
    /^[a-z0-9.-]+$/.test(name) ? null : `The setting "${name}" may only hold small letters, digits, dots and dashes.`,
    /-\d+$/.test(name) ? `The setting "${name}" must not end with a dash and a number, because a file name ends with the run number.` : null,
    all.filter((other) => other === name).length > 1 ? `Two settings are named "${name}".` : null,
  ].filter((problem) => problem !== null)
}

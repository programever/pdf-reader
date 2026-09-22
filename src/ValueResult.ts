import { readdir, readFile } from "node:fs/promises"
import { join } from "node:path"
import type { RunnerVersion } from "./Runner.ts"
import type { Figure } from "./Template.ts"
import type { TextSetting } from "./TextModel.ts"
import type { ValueCall, ValueSetting } from "./ValueModel.ts"

export type Try = { pages: number[] } & Omit<ValueCall, "prompt"> & { prompt?: string }

export type Found = {
  value: string | null
  number?: number | null
  notANumber?: string
  foundOnPages: number[] | null
  valuesGiven: string
  calls: Try[]
}

export type Failed = { failed: string; valuesGiven: string; calls: Try[] }

export type Outcome = Found | Failed

export type ValueResult = {
  run: number
  ocrSetting: TextSetting
  ocrRunner: RunnerVersion
  text: string
  valueSetting: ValueSetting
  valueRunner: RunnerVersion
  startedAt: string
  seconds: number
  results: (Figure | (Figure & Outcome))[]
}

export type NamedValueResult = { name: string } & ValueResult

export async function readValueResults(folder: string): Promise<NamedValueResult[]> {
  const files = (await readdir(folder).catch(() => []))
    .filter((file) => file.endsWith(".json"))
    .sort(byNameThenRun)
  return Promise.all(
    files.map(async (file) => {
      const result: ValueResult = JSON.parse(await readFile(join(folder, file), "utf8"))
      return { name: file.slice(0, -".json".length), ...result }
    }),
  )
}

// "a-2.json" must come after "a-1.json" and before "a-10.json", so the run number is compared as a number.
function byNameThenRun(a: string, b: string): number {
  const [nameA, runA] = split(a)
  const [nameB, runB] = split(b)
  return nameA === nameB ? runA - runB : nameA.localeCompare(nameB)
}

function split(file: string): [string, number] {
  const match = /^(.*)-(\d+)\.json$/.exec(file)
  return match === null ? [file, 0] : [match[1] ?? "", Number(match[2])]
}

import { existsSync } from "node:fs"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { parseArgs } from "node:util"
import { pageCount } from "../src/Pages.ts"
import type { RunnerVersion } from "../src/Runner.ts"
import { newestRun, resultFile, testCaseAt } from "../src/TestCase.ts"
import { chooseTextModel, type TextSetting } from "../src/TextModel.ts"
import { openTextResult, type OpenTextResult } from "../src/TextResult.ts"
import { chooseValueModel, type ChosenValueModel, type ValueCall, type ValueSetting } from "../src/ValueModel.ts"

type Figure = {
  name: string
  pages?: number[]
  instruction: string
  kind: "ReadFromPdf" | "WorkedOut" | "NotApplicable" | "HeldByTheFirm"
  expected?: string | null
}

type Try = { pages: number[] } & ValueCall

type Outcome = { value: string | null; foundOnPages: number[] | null; valuesGiven: string; calls: Try[] } | { failed: string; valuesGiven: string; calls: Try[] }

type ValueResult = {
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

const usage = "npm run generate:value -- <test case folder> --ocr <setting> --value <setting>"

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: { ocr: { type: "string" }, value: { type: "string" } } })
  const folder = positionals[0]
  if (folder === undefined || values.ocr === undefined || values.value === undefined) throw new Error(usage)

  const testCase = testCaseAt(folder)
  if (!existsSync(testCase.inputPdf)) throw new Error(`There is no input.pdf in ${folder}.`)
  const figures: Figure[] = JSON.parse(await readFile(testCase.template, "utf8"))
  const ocrModel = await chooseTextModel(values.ocr)
  const valueModel = await chooseValueModel(values.value)
  await ocrModel.requireReady()
  await valueModel.requireReady()

  const count = await pageCount(testCase.inputPdf)
  const text = await openTextResult(testCase, folder, ocrModel, false)
  const name = `${ocrModel.setting.name}_${valueModel.setting.name}`
  const run = ((await newestRun(testCase.valueResultFolder, name)) ?? 0) + 1
  const file = resultFile(testCase.valueResultFolder, name, run)
  console.log(`Page texts: text-result/${text.name}.json\nResult:     value-result/${name}-${run}.json\n`)

  const startedAt = new Date()
  const results: ValueResult["results"] = []
  for (const figure of figures) {
    if (figure.kind !== "ReadFromPdf" && figure.kind !== "WorkedOut") {
      results.push(figure)
      console.log(`${figure.name}: ${figure.kind}, not asked`)
      continue
    }
    const valuesGiven = valuesSoFar(results)
    const outcome =
      figure.kind === "ReadFromPdf"
        ? await readFromPdf(figure, valuesGiven, count, text, valueModel)
        : await workedOut(figure, valuesGiven, valueModel)
    results.push({ ...figure, ...outcome })
    console.log(`${figure.name}: ${line(outcome)}  (expected ${JSON.stringify(figure.expected ?? null)})`)
  }

  const result: ValueResult = {
    run,
    ocrSetting: ocrModel.setting,
    ocrRunner: await ocrModel.runner(),
    text: text.name,
    valueSetting: valueModel.setting,
    valueRunner: await valueModel.runner(),
    startedAt: startedAt.toISOString(),
    seconds: Math.round((Date.now() - startedAt.getTime()) / 1000),
    results,
  }
  await mkdir(testCase.valueResultFolder, { recursive: true })
  await writeFile(file, `${JSON.stringify(result, null, 2)}\n`)
}

async function readFromPdf(figure: Figure, valuesGiven: string, count: number, text: OpenTextResult, model: ChosenValueModel): Promise<Outcome> {
  const named = figure.pages ?? []
  if (named.length === 0) return { failed: "the figure names no page", valuesGiven, calls: [] }
  const first = Math.min(...named)
  const last = Math.max(...named)
  const tries = [named, [last + 1], [first - 1]].filter((pages) => pages.every((page) => page >= 1 && page <= count))

  const calls: Try[] = []
  for (const pages of tries) {
    const pageTexts: string[] = []
    for (const page of pages) {
      const read = text.pageText(page) ?? (await text.readPage(page))
      if ("failed" in read) return { failed: `page ${page} could not be read: ${read.failed}`, valuesGiven, calls }
      pageTexts.push(read.text)
    }
    const answer = await model.readValue({ pageText: pageTexts.join("\n\n"), instruction: figure.instruction, valuesSoFar: valuesGiven })
    if ("failed" in answer) return { failed: answer.failed, valuesGiven, calls }
    calls.push({ pages, ...answer.call })
    if (answer.value !== null) return { value: answer.value, foundOnPages: pages, valuesGiven, calls }
  }
  return { value: null, foundOnPages: null, valuesGiven, calls }
}

async function workedOut(figure: Figure, valuesGiven: string, model: ChosenValueModel): Promise<Outcome> {
  const answer = await model.workOut({ instruction: figure.instruction, valuesSoFar: valuesGiven })
  if ("failed" in answer) return { failed: answer.failed, valuesGiven, calls: [] }
  return { value: answer.value, foundOnPages: null, valuesGiven, calls: [{ pages: [], ...answer.call }] }
}

function valuesSoFar(results: ValueResult["results"]): string {
  return results.flatMap((result) => ("value" in result ? [`${result.name} = ${result.value}`] : [])).join("\n")
}

function line(outcome: Outcome): string {
  if ("failed" in outcome) return `FAILED, ${outcome.failed}`
  const seconds = outcome.calls.reduce((sum, call) => sum + call.seconds, 0)
  const where = outcome.foundOnPages === null ? "" : ` on page ${outcome.foundOnPages.join(", ")}`
  return `${JSON.stringify(outcome.value)}${where}, ${outcome.calls.length} question${outcome.calls.length === 1 ? "" : "s"}, ${seconds} s`
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})

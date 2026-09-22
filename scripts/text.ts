import { existsSync } from "node:fs"
import { parseArgs } from "node:util"
import { pageCount } from "../src/Pages.ts"
import { pagesOfTemplate } from "../src/Template.ts"
import { testCaseAt } from "../src/TestCase.ts"
import { chooseTextModel } from "../src/TextModel.ts"
import { openTextResult } from "../src/TextResult.ts"

const usage = "npm run generate:text -- <test case folder> --setting <name> [--pages 9 | --pages 1-10] [--new-run] [--retry-failed]"

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      setting: { type: "string" },
      pages: { type: "string" },
      "new-run": { type: "boolean", default: false },
      "retry-failed": { type: "boolean", default: false },
    },
  })
  const folder = positionals[0]
  if (folder === undefined || values.setting === undefined) throw new Error(usage)

  const testCase = testCaseAt(folder)
  if (!existsSync(testCase.inputPdf)) throw new Error(`There is no input.pdf in ${folder}.`)
  const model = await chooseTextModel(values.setting)
  const count = await pageCount(testCase.inputPdf)
  const pages = values.pages === undefined ? await pagesOfTemplate(testCase.template) : pagesFrom(values.pages, count)
  const outside = pages.filter((page) => page < 1 || page > count)
  if (outside.length > 0) throw new Error(`template.json names page ${outside.join(", ")}, but this PDF has pages 1 to ${count}.`)
  if (pages.length === 0) throw new Error("template.json names no page.")

  await model.requireReady()
  const text = await openTextResult(testCase, folder, model, values["new-run"])
  console.log(`Pages:    ${pages.join(", ")}${values.pages === undefined ? " (named by template.json)" : ""}`)
  console.log(`Pictures: ${text.picturesFolder}`)
  console.log(`Result:   text-result/${text.name}.json`)

  for (const page of pages) {
    const before = text.pageText(page)
    if (before !== undefined && !("failed" in before && values["retry-failed"])) {
      console.log(`page ${page}: ${"failed" in before ? `failed before (${before.failed})` : "already read"}`)
      continue
    }
    const read = await text.readPage(page)
    if ("failed" in read) {
      console.log(`page ${page}: FAILED, ${read.failed}`)
    } else {
      const calls = read.calls.map((call) => `${call.seconds} s, ${call.inputTokens} in, ${call.outputTokens} out`).join(" | ")
      console.log(`page ${page}: ${read.text.length} letters (${calls})`)
    }
  }

  const failedPages = text.failedPages()
  console.log(failedPages.length === 0 ? "No page failed." : `Failed pages: ${failedPages.join(", ")}`)
}

function pagesFrom(range: string, count: number): number[] {
  const match = /^(\d+)(?:-(\d+))?$/.exec(range)
  if (match === null) throw new Error(`--pages must look like 9 or 1-10, not "${range}".`)
  const first = Number(match[1])
  const last = Number(match[2] ?? match[1])
  if (first < 1 || last > count || first > last) throw new Error(`--pages ${range}: this PDF has pages 1 to ${count}.`)
  return Array.from({ length: last - first + 1 }, (_, i) => first + i)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})

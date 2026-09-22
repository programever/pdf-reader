import { readdir, readFile, writeFile } from "node:fs/promises"
import { basename, join, relative, resolve } from "node:path"
import { reportHtml } from "../src/Report.ts"
import { readTemplate } from "../src/Template.ts"
import { testCaseAt } from "../src/TestCase.ts"
import type { TextResult } from "../src/TextResult.ts"
import { readValueResults } from "../src/ValueResult.ts"

const usage = "npm run generate:report -- <test case folder>"

async function main(): Promise<void> {
  const folder = process.argv[2]
  if (folder === undefined) throw new Error(usage)
  const testCase = testCaseAt(folder)
  const title = basename(resolve(folder))
  const figures = await readTemplate(testCase.template)
  const runs = await readValueResults(testCase.valueResultFolder)
  if (runs.length === 0) throw new Error(`There is no run in ${folder}/value-result. Run generate:value first.`)

  const texts = new Map<string, TextResult>()
  for (const file of (await readdir(testCase.textResultFolder).catch(() => [])).filter((file) => file.endsWith(".json"))) {
    texts.set(file.slice(0, -".json".length), JSON.parse(await readFile(join(testCase.textResultFolder, file), "utf8")))
  }

  const reportFile = join(resolve(folder), `${title}.html`)
  const html = reportHtml({
    title,
    figures,
    runs,
    texts,
    picturePath: (pictures, page) => relative(resolve(folder), join(testCase.pagesFolder, pictures, `${page}.png`)),
  })
  await writeFile(reportFile, html)
  console.log(`Report: ${reportFile}\n${runs.length} run${runs.length === 1 ? "" : "s"}: ${runs.map((run) => run.name).join(", ")}`)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})

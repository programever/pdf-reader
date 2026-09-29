import { existsSync } from "node:fs"
import { join } from "node:path"
import { parseArgs } from "node:util"
import { writeFile } from "node:fs/promises"
import { drawingFile, drawMissingPages, pageCount, picturesName, type Drawing } from "../src/Pages.ts"
import { testCaseAt } from "../src/TestCase.ts"

const usage = "npm run generate:pages -- <test case folder> [--dpi 200]"

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: { dpi: { type: "string", default: "200" } } })
  const folder = positionals[0]
  const dpi = Number(values.dpi)
  if (folder === undefined || !Number.isInteger(dpi) || dpi < 72) throw new Error(usage)

  const testCase = testCaseAt(folder)
  if (!existsSync(testCase.inputPdf)) throw new Error(`There is no input.pdf in ${folder}.`)

  const count = await pageCount(testCase.inputPdf)
  const allPages = Array.from({ length: count }, (_, i) => i + 1)
  const picturesFolder = join(testCase.pagesFolder, await picturesName(dpi))
  const startedAt = new Date()
  const drawn = await drawMissingPages(testCase.inputPdf, picturesFolder, allPages, dpi)
  if (drawn.length === count) {
    const drawing: Drawing = { pages: count, seconds: Math.round((Date.now() - startedAt.getTime()) / 1000), startedAt: startedAt.toISOString() }
    await writeFile(drawingFile(picturesFolder), `${JSON.stringify(drawing, null, 2)}\n`)
  }
  console.log(`Pictures: ${picturesFolder}`)
  console.log(`${count} pages: ${drawn.length} drawn now, ${count - drawn.length} were already there.`)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})

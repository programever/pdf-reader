import { readdir, readFile } from "node:fs/promises"
import { join, resolve } from "node:path"

export type TestCase = {
  inputPdf: string
  template: string
  pagesFolder: string
  textResultFolder: string
  valueResultFolder: string
}

export function testCaseAt(path: string): TestCase {
  const folder = resolve(path)
  return {
    inputPdf: join(folder, "input.pdf"),
    template: join(folder, "template.json"),
    pagesFolder: join(folder, "pages"),
    textResultFolder: join(folder, "text-result"),
    valueResultFolder: join(folder, "value-result"),
  }
}

export function resultFile(folder: string, settingName: string, run: number): string {
  return join(folder, `${settingName}-${run}.json`)
}

export async function newestRun(folder: string, settingName: string): Promise<number | null> {
  const files = await readdir(folder).catch(() => [])
  const runs = files.flatMap((file) => {
    const match = file.startsWith(`${settingName}-`) ? /^(\d+)\.json$/.exec(file.slice(settingName.length + 1)) : null
    return match === null ? [] : [Number(match[1])]
  })
  return runs.length === 0 ? null : Math.max(...runs)
}

export async function pagesOfTemplate(templateFile: string): Promise<number[]> {
  const figures: unknown = JSON.parse(await readFile(templateFile, "utf8"))
  if (!Array.isArray(figures)) throw new Error(`${templateFile} is not a list of figures.`)
  const pages = figures.flatMap((figure: unknown) => {
    const named = typeof figure === "object" && figure !== null && "pages" in figure ? figure.pages : []
    if (!Array.isArray(named) || !named.every((page): page is number => Number.isInteger(page))) {
      throw new Error(`${templateFile}: "pages" must be a list of whole numbers, not ${JSON.stringify(named)}.`)
    }
    return named
  })
  return [...new Set(pages)].sort((a, b) => a - b)
}

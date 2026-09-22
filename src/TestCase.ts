import { readdir } from "node:fs/promises"
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

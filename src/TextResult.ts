import { existsSync } from "node:fs"
import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { basename, join } from "node:path"
import { isDeepStrictEqual } from "node:util"
import { pictureFile, picturesName } from "./Pages.ts"
import type { RunnerVersion } from "./Runner.ts"
import { newestRun, resultFile, type TestCase } from "./TestCase.ts"
import type { ChosenTextModel, PageReading, TextSetting } from "./TextModel.ts"

export type PageText = { page: number } & PageReading

export type TextResult = {
  run: number
  setting: TextSetting
  runner: RunnerVersion
  pictures: string
  pages: PageText[]
}

export type OpenTextResult = {
  name: string
  picturesFolder: string
  pageText(page: number): PageText | undefined
  failedPages(): number[]
  readPage(page: number): Promise<PageText>
}

export async function openTextResult(testCase: TestCase, testCaseFolder: string, model: ChosenTextModel, newRun: boolean): Promise<OpenTextResult> {
  const setting = model.setting
  const pictures = await picturesName(setting.dpi)
  const picturesFolder = join(testCase.pagesFolder, pictures)
  const newest = await newestRun(testCase.textResultFolder, setting.name)
  const run = newest === null ? 1 : newRun ? newest + 1 : newest
  const file = resultFile(testCase.textResultFolder, setting.name, run)
  const now: TextResult = { run, setting, runner: await model.runner(), pictures, pages: [] }
  const result = existsSync(file) ? await continued(file, now) : now

  return {
    name: basename(file, ".json"),
    picturesFolder,
    pageText: (page) => result.pages.find((read) => read.page === page),
    failedPages: () => result.pages.filter((read) => "failed" in read).map((read) => read.page),

    async readPage(page) {
      const picture = pictureFile(picturesFolder, page)
      if (!existsSync(picture)) {
        throw new Error(`There is no picture of page ${page} in ${picturesFolder}.\nDraw the pages first: npm run generate:pages -- ${testCaseFolder} --dpi ${setting.dpi}`)
      }
      const read: PageText = { page, ...(await model.readPage(await readFile(picture))) }
      result.pages = [...result.pages.filter((before) => before.page !== page), read].sort((a, b) => a.page - b.page)
      await mkdir(testCase.textResultFolder, { recursive: true })
      // A run can be stopped at any moment. A half written file would lose every page read so far, so the file is swapped in whole.
      await writeFile(`${file}.part`, `${JSON.stringify(result, null, 2)}\n`)
      await rename(`${file}.part`, file)
      return read
    },
  }
}

async function continued(file: string, now: TextResult): Promise<TextResult> {
  const result: TextResult = JSON.parse(await readFile(file, "utf8"))
  const before = { ...result, pages: [] }
  if (!isDeepStrictEqual(before, now)) {
    throw new Error(
      `${file} was made with another setting, runner or pictures than now.\n` +
        `In the file: ${JSON.stringify(before)}\nNow:         ${JSON.stringify(now)}\n` +
        "A setting that was used is never changed. Give the changed setting a new name, or start a new run with --new-run.",
    )
  }
  return result
}

import { existsSync } from "node:fs"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { PDFiumLibrary } from "@hyzyla/pdfium"
import { PNG } from "pngjs"

export async function picturesName(dpi: number): Promise<string> {
  const packageFile = new URL("../node_modules/@hyzyla/pdfium/package.json", import.meta.url)
  const packageJson: unknown = JSON.parse(await readFile(packageFile, "utf8"))
  const version = typeof packageJson === "object" && packageJson !== null && "version" in packageJson ? packageJson.version : null
  if (typeof version !== "string") throw new Error("The version of @hyzyla/pdfium cannot be read.")
  return `pdfium-${version}-${dpi}dpi`
}

export function pictureFile(folder: string, page: number): string {
  return join(folder, `${page}.png`)
}

export type Drawing = { pages: number; seconds: number; startedAt: string }

export function drawingFile(folder: string): string {
  return join(folder, "drawing.json")
}

export async function readDrawing(folder: string): Promise<Drawing> {
  const file = drawingFile(folder)
  if (!existsSync(file)) throw new Error(`There is no drawing.json in ${folder}. Draw the pages first: npm run generate:pages`)
  return JSON.parse(await readFile(file, "utf8"))
}

export async function pageCount(pdfFile: string): Promise<number> {
  const library = await PDFiumLibrary.init()
  const document = await library.loadDocument(await readFile(pdfFile))
  const count = document.getPageCount()
  document.destroy()
  library.destroy()
  return count
}

export async function drawMissingPages(pdfFile: string, folder: string, pages: number[], dpi: number): Promise<number[]> {
  const missing = pages.filter((page) => !existsSync(pictureFile(folder, page)))
  if (missing.length === 0) return []

  await mkdir(folder, { recursive: true })
  const library = await PDFiumLibrary.init()
  const document = await library.loadDocument(await readFile(pdfFile))
  for (const page of missing) {
    // A PDF measures in points, and 72 points are one inch. So scale 1 is 72 dots per inch.
    const drawn = await document.getPage(page - 1).render({ scale: dpi / 72, renderFormFields: true })
    await writeFile(pictureFile(folder, page), pngFromBgra(drawn.data, drawn.width, drawn.height))
  }
  document.destroy()
  library.destroy()
  return missing
}

function pngFromBgra(bgra: Uint8Array, width: number, height: number): Buffer {
  const png = new PNG({ width, height })
  for (let i = 0; i < bgra.length; i += 4) {
    png.data[i] = bgra[i + 2] ?? 0
    png.data[i + 1] = bgra[i + 1] ?? 0
    png.data[i + 2] = bgra[i] ?? 0
    png.data[i + 3] = 255
  }
  return PNG.sync.write(png)
}

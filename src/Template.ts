import { readFile } from "node:fs/promises"

export type Expected = {
  type: "string" | "number"
  value: string | null
}

export type Kind = "ReadFromPdf" | "WorkedOut" | "NotApplicable" | "HeldByTheFirm"

export type Figure = {
  name: string
  pages?: number[]
  instruction: string
  kind: Kind
  expected?: Expected
}

const kinds: Kind[] = ["ReadFromPdf", "WorkedOut", "NotApplicable", "HeldByTheFirm"]

export async function readTemplate(file: string): Promise<Figure[]> {
  const figures: unknown = JSON.parse(await readFile(file, "utf8"))
  if (!Array.isArray(figures)) throw new Error(`${file} is not a list of figures.`)
  return figures.map((figure: unknown, index) => checkedFigure(figure, `${file}, figure ${index + 1}`))
}

export async function pagesOfTemplate(file: string): Promise<number[]> {
  const pages = (await readTemplate(file)).flatMap((figure) => figure.pages ?? [])
  return [...new Set(pages)].sort((a, b) => a - b)
}

export function numberIn(text: string): number | { notANumber: string } {
  const found = text.match(/-?\d[\d,]*(?:\.\d+)?/g) ?? []
  if (found.length === 0) return { notANumber: "the text holds no number" }
  if (found.length > 1) return { notANumber: `the text holds ${found.length} numbers: ${found.join(", ")}` }
  return Number((found[0] ?? "").replaceAll(",", ""))
}

function checkedFigure(figure: unknown, where: string): Figure {
  if (typeof figure !== "object" || figure === null) throw new Error(`${where}: a figure must be an object.`)
  const { name, pages, instruction, kind, expected } = figure as Record<string, unknown>
  if (typeof name !== "string") throw new Error(`${where}: "name" must be a text.`)
  if (typeof instruction !== "string") throw new Error(`${where} (${name}): "instruction" must be a text.`)
  if (!kinds.some((known) => known === kind)) throw new Error(`${where} (${name}): "kind" must be one of ${kinds.join(", ")}.`)
  if (pages !== undefined && (!Array.isArray(pages) || !pages.every((page) => Number.isInteger(page)))) {
    throw new Error(`${where} (${name}): "pages" must be a list of whole numbers, not ${JSON.stringify(pages)}.`)
  }
  const answered = kind === "ReadFromPdf" || kind === "WorkedOut"
  if (!answered && expected !== undefined) throw new Error(`${where} (${name}): a ${String(kind)} figure has no "expected".`)
  return {
    name,
    ...(pages === undefined ? {} : { pages: pages as number[] }),
    instruction,
    kind: kind as Kind,
    ...(answered ? { expected: checkedExpected(expected, `${where} (${name})`) } : {}),
  }
}

function checkedExpected(expected: unknown, where: string): Expected {
  const shape = '"expected" must look like {"type": "string" | "number", "value": "text as the PDF writes it" | null}'
  if (typeof expected !== "object" || expected === null) throw new Error(`${where}: ${shape}.`)
  const { type, value } = expected as Record<string, unknown>
  if (type !== "string" && type !== "number") throw new Error(`${where}: ${shape}. The type is ${JSON.stringify(type)}.`)
  if (typeof value !== "string" && value !== null) throw new Error(`${where}: ${shape}. The value is ${JSON.stringify(value)}.`)
  return { type, value }
}

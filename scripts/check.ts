import { readFile } from "node:fs/promises"
import { allModels } from "../src/Settings.ts"
import { chooseTextModel } from "../src/TextModel.ts"
import { chooseValueModel } from "../src/ValueModel.ts"

type Reading = { text: string; calls: { inputTokens: number; outputTokens: number; contextLimit: number }[] } | { failed: string }

const usage = "npm run model:check <ocr setting> <picture file>\nnpm run model:check <value setting>"

// A made-up page, so the check of a value model needs no test case and no OCR model.
const madeUpPage = "POLICY SUMMARY\nPlan: Example Life\nPolicy Currency: US Dollars\nSum Assured: US$1,250,000\nPremium Payment Term: 10 Years"

async function main(): Promise<void> {
  const [settingName, pictureFile] = process.argv.slice(2)
  if (settingName === undefined) throw new Error(usage)
  const { textModels } = await allModels()
  const isOcr = textModels.some((model) => model.settings.some((setting) => setting.name === settingName))
  if (isOcr && pictureFile === undefined) throw new Error(usage)

  const read = isOcr ? await ocrReader(settingName, pictureFile ?? "") : await valueReader(settingName)
  const readings = [await read(), await read()]
  const clean = readings.flatMap((reading) => ("failed" in reading ? [] : [reading]))
  const failures = readings.flatMap((reading) => ("failed" in reading ? [reading.failed] : []))
  const calls = clean.flatMap((reading) => reading.calls)

  const checks: [string, boolean, string][] = [
    ["1. Every answer ends in the normal way", failures.length === 0, failures.join("; ")],
    // A runner file only gives an answer when the runner reported both token numbers, so a clean answer proves this check.
    ["2. The runner reports the tokens in and out", failures.length === 0 && calls.every((call) => call.inputTokens > 0 && call.outputTokens > 0), calls.map((call) => `${call.inputTokens} in, ${call.outputTokens} out`).join(" | ")],
    ["3. The same input gives the same answer two times", clean.length === 2 && clean[0]?.text === clean[1]?.text, clean.map((reading) => JSON.stringify(reading.text.slice(0, 60))).join(" and ")],
    ["5. The input is never cut silently", failures.length === 0 && calls.every((call) => call.inputTokens + call.outputTokens < call.contextLimit), calls.map((call) => `${call.inputTokens + call.outputTokens} of ${call.contextLimit}`).join(" | ")],
  ]
  for (const [name, passed, detail] of checks) console.log(`${passed ? "PASS" : "FAIL"}  ${name}${detail === "" ? "" : `  (${detail})`}`)
  console.log("\nCheck 4, the model is run the way its makers say, is done by a person who reads the makers' guide.")
  if (checks.some(([, passed]) => !passed)) process.exit(1)
}

async function ocrReader(settingName: string, pictureFile: string): Promise<() => Promise<Reading>> {
  const model = await chooseTextModel(settingName)
  await model.requireReady()
  const runner = await model.runner()
  const picture = await readFile(pictureFile)
  console.log(`Setting: ${settingName}\nRunner:  ${runner.name} ${runner.version}\nPicture: ${pictureFile}\n`)
  return () => model.readPage(picture)
}

async function valueReader(settingName: string): Promise<() => Promise<Reading>> {
  const model = await chooseValueModel(settingName)
  await model.requireReady()
  const runner = await model.runner()
  console.log(`Setting: ${settingName}\nRunner:  ${runner.name} ${runner.version}\nInput:   a made-up page, asked for "Sum Assured"\n`)
  return async () => {
    const answer = await model.readValue({ pageText: madeUpPage, instruction: "Sum Assured", valuesSoFar: "Currency = US Dollars" })
    return "failed" in answer ? answer : { text: String(answer.value), calls: [answer.call] }
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})

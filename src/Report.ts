import { judge, type Verdict } from "./Compare.ts"
import type { Figure } from "./Template.ts"
import type { TextResult } from "./TextResult.ts"
import type { NamedValueResult, Outcome, Try } from "./ValueResult.ts"

export type ReportInput = {
  title: string
  figures: Figure[]
  runs: NamedValueResult[]
  texts: Map<string, TextResult>
  picturePath(pictures: string, page: number): string
}

export function reportHtml(input: ReportInput): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escape(input.title)}</title>
<style>${style}</style>
</head>
<body>
<h1>${escape(input.title)}</h1>
<p class="nav"><a href="#comparison">Comparison</a> · <a href="#time-and-score">Time and score</a> · <a href="#time-per-figure">Time per figure</a> · <a href="#stability">Stability</a> · <a href="#runs">Runs</a> · <a href="#pages">Pages</a></p>
<h2 id="comparison">Comparison</h2>
<p>${input.runs.length} run${input.runs.length === 1 ? "" : "s"}, one column each. Click a cell to see its questions in the block of that run. Click a column header to see the run. Click a page number to see the page.</p>
${figuresTable(input)}
<h2 id="time-and-score">Time and score per run</h2>
${timeAndScoreChart(input)}
<h2 id="time-per-figure">Time per figure</h2>
<p>Seconds for all questions of the figure in that run, as a bar. The small number is how many tokens came out, thinking included. Click a cell to see its questions.</p>
${timePerFigureChart(input)}
<h2 id="stability">Stability</h2>
<p>For every pair of settings that ran more than one time: how many figures got the same answer in every run.</p>
${stabilityTable(input)}
<h2 id="runs">Runs</h2>
${input.runs.map((run, runIndex) => runSection(run, runIndex, input.figures)).join("\n")}
<h2 id="pages">Pages</h2>
${pagesSection(input)}
<script>${script}</script>
</body>
</html>
`
}

function figuresTable(input: ReportInput): string {
  const headers = input.runs.map((run, runIndex) => `<th class="run"><a href="#run-${runIndex}">${runLabel(runIndex)}</a><br>${escape(run.ocrSetting.name)}<br>${escape(run.valueSetting.name)}<br>run ${run.run}</th>`).join("")
  const rows = input.figures.map((figure, figureIndex) => {
    const cells = input.runs.map((run, runIndex) => cellOf(run, runIndex, figure, figureIndex)).join("")
    const expected = figure.expected === undefined ? "" : figure.expected.value === null ? "<i>null</i>" : escape(figure.expected.value)
    const pages = figure.pages === undefined ? "" : figure.pages.map((page) => `<a href="#page-${page}">${page}</a>`).join(", ")
    return `<tr><th class="figure">${escape(figure.name)}</th><td>${escape(figure.kind)}</td><td>${pages}</td><td>${expected}</td>${cells}</tr>`
  })
  const scores = input.runs.map((run) => `<td class="score">${escape(scoreOf(run, input.figures))}</td>`).join("")
  return `<table class="figures">
<thead><tr><th>Figure</th><th>Kind</th><th>Page</th><th>Expected</th>${headers}</tr></thead>
<tbody>${rows.join("\n")}</tbody>
<tfoot><tr><th>Score</th><td></td><td></td><td></td>${scores}</tr></tfoot>
</table>`
}

function cellOf(run: NamedValueResult, runIndex: number, figure: Figure, figureIndex: number): string {
  const outcome = outcomeOf(run, figure)
  if (outcome === undefined) return `<td class="not-asked"></td>`
  const verdict = judge(figure.expected ?? { type: "string", value: null }, outcome)
  const id = `d-${runIndex}-${figureIndex}`
  if ("failed" in outcome) return `<td class="failed" data-details="${id}">failed: ${escape(outcome.failed)}</td>`
  const value = outcome.value === null ? "<i>null</i>" : escape(outcome.value)
  const number = outcome.number === undefined || outcome.value === null || outcome.value === String(outcome.number) ? "" : outcome.notANumber === undefined ? ` <small>= ${outcome.number}</small>` : ` <small class="wrong-text">not a number</small>`
  const named = figure.pages ?? []
  const where = outcome.foundOnPages === null || sameList(outcome.foundOnPages, named) ? "" : ` <small>on page ${outcome.foundOnPages.map((page) => `<a href="#page-${page}">${page}</a>`).join(", ")}</small>`
  return `<td class="${verdict}" data-details="${id}">${value}${number}${where}</td>`
}

function detailsOf(run: NamedValueResult, runIndex: number, figure: Figure, figureIndex: number): string {
  const outcome = outcomeOf(run, figure)
  if (outcome === undefined) return ""
  const number = "number" in outcome && outcome.number !== undefined ? `<p>Number taken out of the answer: <b>${outcome.number ?? "null"}</b>${outcome.notANumber === undefined ? "" : ` (${escape(outcome.notANumber)})`}</p>` : ""
  const failed = "failed" in outcome ? `<p class="failed">Failed: ${escape(outcome.failed)}</p>` : ""
  return `<div class="details" id="d-${runIndex}-${figureIndex}">
<h2>${escape(figure.name)} <small>${escape(run.name)}</small></h2>
<p>Instruction:</p><pre>${escape(figure.instruction)}</pre>
${failed}${number}
<p>Values found before:</p><pre>${outcome.valuesGiven === "" ? "<i>none</i>" : escape(outcome.valuesGiven)}</pre>
<p>Questions asked:</p>
${outcome.calls.map(callOf).join("")}
</div>`
}

function callOf(call: Try, index: number): string {
  const pages = call.pages.length === 0 ? "no page" : `page ${call.pages.map((page) => `<a href="#page-${page}">${page}</a>`).join(", ")}`
  const input = call.prompt === undefined ? "<p><i>The full input was not saved in this run.</i></p>" : `<details><summary>Full input sent to the model (${call.prompt.length} letters)</summary><pre>${escape(call.prompt)}</pre></details>`
  const thinking = call.thinking === null ? "" : `<p>Thinking (${call.thinking.length} letters):</p><pre>${escape(call.thinking)}</pre>`
  const answer = `<p>Answer: <b>${call.answer === null ? "null" : escape(call.answer)}</b></p>`
  return `<div class="call"><p><b>${index + 1}.</b> ${pages}, ${call.seconds} s, ${call.inputTokens} tokens in, ${call.outputTokens} out, window ${call.contextLimit}.</p>${input}<details open><summary>Response from the model</summary>${thinking}${answer}</details></div>`
}

function timeAndScoreChart(input: ReportInput): string {
  const longest = Math.max(1, ...input.runs.map((run) => run.time?.total ?? run.seconds))
  const rows = input.runs.map((run, runIndex) => {
    const counts = countsOf(run, input.figures)
    const asked = Math.max(1, counts.right + counts.wrong + counts.null + counts.failed)
    const score = (Object.keys(counts) as Verdict[])
      .filter((verdict) => counts[verdict] > 0)
      .map((verdict) => `<span class="bar ${verdict}" style="width:${(100 * counts[verdict]) / asked}%" title="${counts[verdict]} ${verdict}">${counts[verdict]}</span>`)
      .join("")
    const time =
      run.time === undefined
        ? `<span class="bar time" style="width:${(100 * run.seconds) / longest}%">${minutes(run.seconds)}</span>`
        : [
            ["draw", run.time.drawPages.seconds, "PDF -> pictures"],
            ["read", run.time.readPages.seconds, "pictures -> texts"],
            ["time", run.time.readValues.seconds, "texts -> values"],
          ]
            .filter(([, seconds]) => (seconds as number) > 0)
            .map(([cls, seconds, label]) => `<span class="bar ${cls}" style="width:${(100 * (seconds as number)) / longest}%" title="${label}: ${seconds} s">${minutes(seconds as number)}</span>`)
            .join("")
    return `<tr><th><a href="#run-${runIndex}">${runLabel(runIndex)}</a></th><td class="names">${escape(run.ocrSetting.name)}<br>${escape(run.valueSetting.name)} run ${run.run}</td><td class="chart"><div class="bars">${score}</div></td><td class="chart"><div class="bars">${time}</div></td></tr>`
  })
  return `<table class="chart"><thead><tr><th></th><th>Settings</th><th>Score (green right, red wrong, grey null, yellow failed)</th><th>Time of the run (dark blue PDF -> pictures, light blue pictures -> texts, blue texts -> values)</th></tr></thead><tbody>${rows.join("\n")}</tbody></table>
<p>A page is drawn one time and read one time, then reused by every later run of the same test case. The time of the first two steps is the time of that first time.</p>`
}

function timePerFigureChart(input: ReportInput): string {
  const asked = input.figures.map((figure, figureIndex) => ({ figure, figureIndex })).filter(({ figure }) => input.runs.some((run) => outcomeOf(run, figure) !== undefined))
  const longest = Math.max(1, ...input.runs.flatMap((run) => asked.map(({ figure }) => secondsOf(outcomeOf(run, figure)))))
  const headers = input.runs.map((run, runIndex) => `<th class="run"><a href="#run-${runIndex}">${runLabel(runIndex)}</a></th>`).join("")
  const rows = asked.map(({ figure, figureIndex }) => {
    const cells = input.runs.map((run, runIndex) => {
      const outcome = outcomeOf(run, figure)
      if (outcome === undefined) return `<td class="not-asked"></td>`
      const seconds = secondsOf(outcome)
      const out = outcome.calls.reduce((sum, call) => sum + call.outputTokens, 0)
      return `<td class="chart" data-details="d-${runIndex}-${figureIndex}"><div class="bars"><span class="bar time" style="width:${(100 * seconds) / longest}%">${seconds} s</span></div><small>${outcome.calls.length} question${outcome.calls.length === 1 ? "" : "s"}, ${out} out</small></td>`
    })
    return `<tr><th class="figure">${escape(figure.name)}</th>${cells.join("")}</tr>`
  })
  return `<table class="chart figures"><thead><tr><th>Figure</th>${headers}</tr></thead><tbody>${rows.join("\n")}</tbody></table>`
}

function stabilityTable(input: ReportInput): string {
  const groups = new Map<string, number[]>()
  input.runs.forEach((run, runIndex) => {
    const key = `${run.ocrSetting.name}_${run.valueSetting.name}`
    groups.set(key, [...(groups.get(key) ?? []), runIndex])
  })
  const rows = [...groups]
    .filter(([, runIndexes]) => runIndexes.length > 1)
    .map(([key, runIndexes]) => {
      const asked = input.figures.filter((figure) => runIndexes.some((runIndex) => outcomeOf(input.runs[runIndex] as NamedValueResult, figure) !== undefined))
      const differing = asked.filter((figure) => {
        const answers = runIndexes.map((runIndex) => answerOf(outcomeOf(input.runs[runIndex] as NamedValueResult, figure)))
        return new Set(answers).size > 1
      })
      const same = asked.length - differing.length
      const list = differing.length === 0 ? "" : `: ${differing.map((figure) => escape(figure.name)).join(", ")}`
      return `<tr><td>${escape(key)}</td><td>${runIndexes.map((runIndex) => `<a href="#run-${runIndex}">${runLabel(runIndex)}</a>`).join(", ")}</td><td class="${differing.length === 0 ? "right" : "wrong"}">${same} of ${asked.length} the same</td><td>${differing.length} differ${list}</td></tr>`
    })
  if (rows.length === 0) return "<p><i>No pair of settings has run more than one time yet.</i></p>"
  return `<table class="figures"><thead><tr><th>Settings</th><th>Runs</th><th>Same answer in every run</th><th>Figures that differ</th></tr></thead><tbody>${rows.join("\n")}</tbody></table>`
}

function answerOf(outcome: Outcome | undefined): string {
  if (outcome === undefined) return "(not asked)"
  if ("failed" in outcome) return `(failed: ${outcome.failed})`
  return outcome.value === null ? "(null)" : outcome.value.trim()
}

function secondsOf(outcome: Outcome | undefined): number {
  return outcome === undefined ? 0 : outcome.calls.reduce((sum, call) => sum + call.seconds, 0)
}

function minutes(seconds: number): string {
  return seconds < 90 ? `${seconds} s` : `${Math.round(seconds / 60)} min`
}

function pagesSection(input: ReportInput): string {
  const pages = [...new Set(input.runs.flatMap((run) => run.results.flatMap((result) => ("calls" in result ? result.calls.flatMap((call) => call.pages) : []))))].sort((a, b) => a - b)
  return pages
    .map((page) => {
      const readings = [...input.texts]
        .filter(([name]) => input.runs.some((run) => run.text === name))
        .map(([name, text]) => {
          const read = text.pages.find((candidate) => candidate.page === page)
          const body = read === undefined ? "<i>not read</i>" : "failed" in read ? `<i class="failed">failed: ${escape(read.failed)}</i>` : `<pre>${escape(read.text)}</pre>`
          return `<div class="reading"><h3>${escape(name)}</h3>${body}</div>`
        })
      const pictures = [...new Set([...input.texts.values()].map((text) => text.pictures))]
      const images = pictures.map((folder) => `<img src="${escape(input.picturePath(folder, page))}" alt="page ${page}">`).join("")
      return `<section class="page" id="page-${page}"><h2>Page ${page}</h2><div class="side-by-side"><div class="picture">${images}</div><div class="texts">${readings.join("")}</div></div></section>`
    })
    .join("\n")
}

function runSection(run: NamedValueResult, runIndex: number, figures: Figure[]): string {
  const rows = figures.map((figure) => {
    const outcome = outcomeOf(run, figure)
    if (outcome === undefined) return `<tr><th class="figure">${escape(figure.name)}</th><td colspan="6" class="not-asked">${escape(figure.kind)}, not asked</td></tr>`
    const verdict = judge(figure.expected ?? { type: "string", value: null }, outcome)
    const value = "failed" in outcome ? `failed: ${escape(outcome.failed)}` : outcome.value === null ? "<i>null</i>" : escape(outcome.value)
    const expected = figure.expected === undefined ? "" : figure.expected.value === null ? "<i>null</i>" : escape(figure.expected.value)
    const pages = outcome.calls.map((call) => (call.pages.length === 0 ? "-" : call.pages.join("+"))).join(", ")
    const seconds = outcome.calls.reduce((sum, call) => sum + call.seconds, 0)
    const tokens = outcome.calls.map((call) => `${call.inputTokens} in, ${call.outputTokens} out`).join("; ")
    return `<tr data-details="d-${runIndex}-${figures.indexOf(figure)}"><th class="figure">${escape(figure.name)}</th><td>${expected}</td><td class="${verdict}">${value}</td><td>${verdict}</td><td>${pages}</td><td>${seconds} s</td><td>${tokens}</td></tr>`
  })
  return `<section class="run" id="run-${runIndex}">
<h3>${runLabel(runIndex)}: ${escape(run.name)}</h3>
<p><b>Score:</b> ${escape(scoreOf(run, figures))}. Started ${escape(run.startedAt)}. Page texts from <code>text-result/${escape(run.text)}.json</code>.</p>
<div class="side-by-side">
<div class="setting"><h4>OCR model (Image -> Text)</h4><p>Runner: ${escape(run.ocrRunner.name)} ${escape(run.ocrRunner.version)}</p>${settingTable(run.ocrSetting)}</div>
<div class="setting"><h4>Value model (Text -> Value, WorkedOut)</h4><p>Runner: ${escape(run.valueRunner.name)} ${escape(run.valueRunner.version)}</p>${settingTable(run.valueSetting)}</div>
</div>
${timeSection(run)}
<h4>The figures of this run</h4>
<p>Click a row to see its questions on the right.</p>
<div class="side-by-side">
<div class="run-table"><table class="figures"><thead><tr><th>Figure</th><th>Expected</th><th>Value</th><th>Verdict</th><th>Pages asked</th><th>Time</th><th>Tokens</th></tr></thead><tbody>${rows.join("\n")}</tbody></table></div>
<div class="run-details"><p class="placeholder"><i>The questions of the clicked row appear here.</i></p>${figures.map((figure, figureIndex) => detailsOf(run, runIndex, figure, figureIndex)).join("")}</div>
</div>
</section>`
}

function timeSection(run: NamedValueResult): string {
  if (run.time === undefined) return ""
  const { drawPages, readPages, readValues, total } = run.time
  const pages = readPages.pages.map((page) => `<a href="#page-${page}">${page}</a>`).join(", ")
  const questions = readValues.perQuestion.map((question) => `<tr><td>${escape(question.figure)}</td><td>${question.pages.length === 0 ? "-" : question.pages.join("+")}</td><td>${question.seconds} s</td></tr>`).join("")
  return `<h4>Time</h4>
<table class="figures time">
<tr><th>1. PDF -> pictures</th><td>${drawPages.pages} pages</td><td>${drawPages.seconds} s</td></tr>
<tr><th>2. Pictures -> texts</th><td>pages ${pages}</td><td>${readPages.seconds} s</td></tr>
<tr><th>3. Texts -> values</th><td>${readValues.questions} question${readValues.questions === 1 ? "" : "s"}</td><td>${readValues.seconds} s</td></tr>
<tr><th>Total</th><td></td><td><b>${total} s</b> (${minutes(total)})</td></tr>
</table>
<details><summary>Every question of step 3, in the order asked</summary><table class="figures time"><thead><tr><th>Figure</th><th>Page</th><th>Seconds</th></tr></thead><tbody>${questions}</tbody></table></details>`
}

// Every value of a setting is shown, whatever the model file put in it, so no field is ever hidden by the report.
function settingTable(setting: Record<string, unknown>): string {
  const rows = Object.entries(setting).map(([key, value]) => {
    const shown =
      typeof value === "string" && (value.includes("\n") || value.length > 80)
        ? `<pre>${escape(value)}</pre>`
        : typeof value === "object" && value !== null
          ? `<pre>${escape(JSON.stringify(value, null, 2))}</pre>`
          : escape(String(value))
    return `<tr><th>${escape(key)}</th><td>${shown}</td></tr>`
  })
  return `<table class="setting">${rows.join("")}</table>`
}

function runLabel(runIndex: number): string {
  return `Run ${String.fromCharCode(65 + runIndex)}`
}

function countsOf(run: NamedValueResult, figures: Figure[]): Record<Verdict, number> {
  const counts: Record<Verdict, number> = { right: 0, wrong: 0, null: 0, failed: 0 }
  for (const figure of figures) {
    const outcome = outcomeOf(run, figure)
    if (outcome === undefined || figure.expected === undefined) continue
    counts[judge(figure.expected, outcome)] += 1
  }
  return counts
}

function scoreOf(run: NamedValueResult, figures: Figure[]): string {
  const counts = countsOf(run, figures)
  const asked = counts.right + counts.wrong + counts.null + counts.failed
  const parts = (Object.keys(counts) as Verdict[]).filter((verdict) => counts[verdict] > 0).map((verdict) => `${counts[verdict]} ${verdict}`)
  return `${parts.join(", ")} of ${asked}. ${minutes(run.seconds)}`
}

function outcomeOf(run: NamedValueResult, figure: Figure): Outcome | undefined {
  const result = run.results.find((candidate) => candidate.name === figure.name)
  return result !== undefined && "calls" in result ? result : undefined
}

function sameList(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index])
}

function escape(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;")
}

const style = `
body { font: 14px/1.4 system-ui, sans-serif; margin: 16px; color: #222; }
h1 { font-size: 22px; }
h2 { font-size: 18px; margin: 24px 0 8px; }
h2 small { font-weight: normal; color: #666; margin-left: 8px; }
h3 { font-size: 15px; margin: 8px 0 4px; }
h4 { font-size: 13px; margin: 12px 0 4px; }
p.nav a { margin-right: 4px; }
code { background: #f0f0f0; padding: 0 3px; }
section.run { margin-top: 20px; border: 1px solid #ddd; padding: 8px 12px; }
section.run .side-by-side { gap: 24px; }
div.setting { flex: 1 1 50%; min-width: 0; }
table.setting { border-collapse: collapse; width: 100%; font-size: 12px; }
table.setting th, table.setting td { border: 1px solid #e0e0e0; padding: 3px 6px; text-align: left; vertical-align: top; }
table.setting th { width: 120px; font-weight: normal; color: #555; background: #fafafa; }
table.setting pre { margin: 0; }
th.run a { font-weight: bold; }
table.figures { border-collapse: collapse; }
table.figures th, table.figures td { border: 1px solid #ccc; padding: 4px 8px; text-align: left; vertical-align: top; }
table.figures thead th { background: #f2f2f2; }
table.figures th.run { font-weight: normal; font-family: monospace; }
table.figures th.figure { font-weight: normal; }
[data-details] { cursor: pointer; }
tr[data-details]:hover td, tr[data-details]:hover th { background: #eef4ff; }
table.chart td.names { font-family: monospace; font-size: 12px; white-space: nowrap; }
table.chart td.chart { width: 34%; min-width: 220px; vertical-align: middle; }
.bars { display: flex; width: 100%; height: 18px; background: #f4f4f4; border: 1px solid #ddd; }
.bar { display: block; height: 100%; overflow: hidden; font-size: 11px; line-height: 18px; padding-left: 4px; white-space: nowrap; box-sizing: border-box; }
.bar.right { background: #8fd48f; } .bar.wrong { background: #f09c9c; } .bar.null { background: #c8c8c8; } .bar.failed { background: #f2dc7a; }
.bar.time { background: #9bbbe8; } .bar.draw { background: #3b5f9e; color: #fff; } .bar.read { background: #c9dcf5; }
table.time { margin: 4px 0 8px; } table.time th { font-weight: normal; }
table.chart small { display: block; margin-top: 2px; }
details summary { cursor: pointer; color: #335; }
td.right { background: #d8f3d8; }
td.wrong { background: #f8d0d0; }
td.null { background: #e6e6e6; color: #555; }
td.failed { background: #fff3b0; }
td.not-asked { background: #fafafa; }
td.score { font-weight: bold; }
small { color: #555; }
small.wrong-text { color: #a00; }
.details { display: none; border: 1px solid #ccc; padding: 8px 12px; background: #fbfbfb; }
.details.open { display: block; }
.details h2 { margin-top: 0; }
.run-table { flex: 0 0 52%; min-width: 0; }
.run-details { flex: 1 1 48%; min-width: 0; position: sticky; top: 8px; align-self: flex-start; max-height: 95vh; overflow: auto; }
.run-details .placeholder { color: #777; }
.run-details:has(.details.open) .placeholder { display: none; }
.call { border-top: 1px solid #e0e0e0; padding-top: 6px; }
pre { white-space: pre-wrap; word-break: break-word; background: #f6f6f6; padding: 6px; margin: 4px 0; font-size: 12px; }
p.failed, i.failed { color: #a00; }
section.page { margin-top: 32px; border-top: 2px solid #ddd; padding-top: 8px; }
.side-by-side { display: flex; gap: 16px; align-items: flex-start; }
.picture { flex: 0 0 50%; }
.picture img { width: 100%; border: 1px solid #ccc; }
.texts { flex: 1 1 50%; min-width: 0; }
.texts pre { max-height: 90vh; overflow: auto; }
`

const script = `
for (const cell of document.querySelectorAll("[data-details]")) {
  cell.addEventListener("click", () => {
    const wanted = document.getElementById(cell.dataset.details)
    for (const open of document.querySelectorAll(".details.open")) if (open !== wanted) open.classList.remove("open")
    wanted.classList.toggle("open")
    if (wanted.classList.contains("open")) {
      const inRunBlock = cell.closest("section.run") !== null
      if (!inRunBlock) wanted.closest("section.run").scrollIntoView({ block: "start" })
    }
  })
}
`

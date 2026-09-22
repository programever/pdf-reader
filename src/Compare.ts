import { numberIn, type Expected } from "./Template.ts"
import type { Outcome } from "./ValueResult.ts"

export type Verdict = "right" | "wrong" | "null" | "failed"

export function judge(expected: Expected, outcome: Outcome): Verdict {
  if ("failed" in outcome) return "failed"
  if (expected.value === null) return outcome.value === null ? "right" : "wrong"
  if (outcome.value === null) return "null"
  return (expected.type === "number" ? sameNumber(expected.value, outcome.number ?? null) : sameText(expected.value, outcome.value)) ? "right" : "wrong"
}

// The model's number is rounded to the decimals that the answer sheet has: 14.1095 against "14.11" is right.
function sameNumber(expectedText: string, number: number | null): boolean {
  const expected = numberIn(expectedText)
  if (number === null || typeof expected !== "number") return false
  const decimals = /\.(\d+)/.exec(expectedText)?.[1]?.length ?? 0
  const scale = 10 ** decimals
  return Math.abs(Math.round(number * scale) / scale - expected) < 1e-9
}

function sameText(expected: string, value: string): boolean {
  return expected.trim().toLowerCase() === value.trim().toLowerCase()
}

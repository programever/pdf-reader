import { spawnSync } from "node:child_process"
import { ollamaUrl } from "../src/Ollama.ts"

const model = process.argv[2]
if (model === undefined) {
  console.error("Say which model: npm run ollama:pull qwen3.8:27b")
  process.exit(1)
}
if (model.endsWith("cloud")) {
  console.error(`${model} is a cloud model. It runs on Ollama's servers, not on this machine. It is not allowed.`)
  process.exit(1)
}

const pull = spawnSync("ollama", ["pull", model], { stdio: "inherit", env: { ...process.env, OLLAMA_HOST: new URL(ollamaUrl).host } })
process.exit(pull.status ?? 1)

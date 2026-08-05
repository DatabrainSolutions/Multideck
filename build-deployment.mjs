#!/usr/bin/env node

import { cp, mkdir, readFile, writeFile } from "node:fs/promises"
import { spawn } from "node:child_process"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = dirname(fileURLToPath(import.meta.url))
const clientDirectory = join(root, "multideck.client")
const websiteDirectory = join(root, "multideck.website")
const clientOutput = join(clientDirectory, "dist")

async function deploymentEnvironment() {
  const environment = { ...process.env }
  if (environment.VITE_SUPABASE_URL) return environment

  try {
    const localEnvironment = await readFile(join(clientDirectory, ".env.local"), "utf8")
    const match = localEnvironment.match(/^VITE_SUPABASE_URL\s*=\s*["']?([^\s"']+)["']?\s*$/m)
    if (match?.[1]) environment.VITE_SUPABASE_URL = match[1]
  } catch (error) {
    if (error?.code !== "ENOENT") throw error
  }

  return environment
}

function run(command, args, cwd, environment) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env: environment, stdio: "inherit" })
    child.on("error", reject)
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`${command} exited with code ${code}`)))
  })
}

async function build() {
  const environment = await deploymentEnvironment()
  await run("npm", ["run", "build"], clientDirectory, environment)
  const appDocument = await readFile(join(clientOutput, "index.html"), "utf8")

  await run("node", ["build.mjs"], websiteDirectory, environment)
  await cp(join(websiteDirectory, "dist"), clientOutput, { recursive: true, force: true })

  const appDirectory = join(clientOutput, "app")
  await mkdir(appDirectory, { recursive: true })
  await writeFile(join(appDirectory, "index.html"), appDocument, "utf8")

  console.log("\nCombined deployment ready: website at /, app at /app, authentication at /auth")
}

build().catch((error) => {
  console.error(error)
  process.exitCode = 1
})

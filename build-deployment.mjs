#!/usr/bin/env node

import { readFile } from "node:fs/promises"
import { spawn } from "node:child_process"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = dirname(fileURLToPath(import.meta.url))
const clientDirectory = join(root, "multideck.client")

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
  console.log("\nMultideck App deployment ready: app at /app and authentication at /auth")
}

build().catch((error) => {
  console.error(error)
  process.exitCode = 1
})

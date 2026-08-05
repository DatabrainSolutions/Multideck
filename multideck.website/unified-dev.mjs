#!/usr/bin/env node

import { spawn } from "node:child_process"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const websiteDirectory = dirname(fileURLToPath(import.meta.url))
const clientDirectory = join(websiteDirectory, "../multideck.client")
const viteEntry = join(clientDirectory, "node_modules/vite/bin/vite.js")
const forwardedArguments = process.argv.slice(2)
const hasPortArgument = forwardedArguments.some((argument) => argument === "--port" || argument.startsWith("--port="))
const hasHostArgument = forwardedArguments.some((argument) => argument === "--host" || argument.startsWith("--host="))

const argumentsForVite = [
  viteEntry,
  ...(hasHostArgument ? [] : ["--host", "127.0.0.1"]),
  ...(hasPortArgument ? [] : ["--port", process.env.PORT || "3000"]),
  "--strictPort",
  ...forwardedArguments,
]

const child = spawn(process.execPath, argumentsForVite, {
  cwd: clientDirectory,
  env: process.env,
  stdio: "inherit",
})

child.on("error", (error) => {
  console.error(`Unable to start unified Multideck development: ${error.message}`)
  process.exitCode = 1
})

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  else process.exitCode = code ?? 1
})

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal))
}

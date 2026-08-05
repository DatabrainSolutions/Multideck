#!/usr/bin/env node
/* Development server. Builds once, serves dist/ with clean URLs, and rebuilds
   whenever a source file changes. No dependencies — node's own http and fs are
   enough for a static site. */

import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { watch } from "node:fs";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

if (!process.argv.includes("--website-only")) {
  console.log("Standalone website mode is disabled by default. Use `npm run dev` for the unified website, auth, and app server.");
  process.exit(0);
}

const root = dirname(fileURLToPath(import.meta.url));
const dist = join(root, "dist");
const port = Number(process.env.PORT || 4321);

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".ico": "image/x-icon",
};

let building = null;

/* The build runs in a fresh child process rather than a re-imported module graph.
   Busting the query string on the two entry modules is not enough: their
   transitive imports — every page file — stay in Node's module cache, so an edit
   to a page would silently keep serving the previous build. */
function build() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(root, "build.mjs")], {
      cwd: root,
      stdio: ["ignore", "ignore", "pipe"],
    });

    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim().split("\n").slice(-4).join("\n") || `exit ${code}`));
    });
  });
}

/* Builds are serialised and debounced. Without both, a single save fires several
   watch events, and two overlapping builds race each other deleting and
   recreating dist/. */
let queued = null;
let timer = null;

function rebuild(reason) {
  clearTimeout(timer);
  timer = setTimeout(() => {
    const previous = building || Promise.resolve();
    building = previous
      .then(build)
      .then(() => console.log(`  rebuilt (${reason})`))
      .catch((error) => console.error(`  build failed: ${error.message}`));
    queued = building;
  }, 120);
  return queued;
}

async function resolve(pathname) {
  const safe = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, "");
  const candidates = extname(safe)
    ? [join(dist, safe)]
    : [join(dist, safe, "index.html"), join(dist, `${safe}.html`)];

  for (const candidate of candidates) {
    try {
      const info = await stat(candidate);
      if (info.isFile()) return candidate;
    } catch {
      /* try the next candidate */
    }
  }
  return null;
}

building = build().catch((error) => console.error(`  build failed: ${error.message}`));
await building;

for (const dir of ["src", "public"]) {
  watch(join(root, dir), { recursive: true }, (_event, file) => rebuild(file || dir));
}

/* Watching the config's directory rather than the file itself: a file watch on
   macOS re-fires indefinitely once the file is replaced by an editor. */
watch(root, (_event, file) => {
  if (file === "site.config.mjs") rebuild(file);
});

createServer(async (request, response) => {
  if (building) await building;

  const url = new URL(request.url, `http://localhost:${port}`);
  const file = await resolve(url.pathname);

  if (!file) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end(`Not found: ${url.pathname}`);
    return;
  }

  const body = await readFile(file);
  response.writeHead(200, {
    "content-type": types[extname(file)] || "application/octet-stream",
    "cache-control": "no-store",
  });
  response.end(body);
}).listen(port, () => {
  console.log(`Multideck website → http://localhost:${port}`);
});

#!/usr/bin/env node
/* Zero-dependency static site build.

   The marketing site ships as plain HTML, one stylesheet and one small script.
   Nothing about it needs a framework at runtime, and a visitor deciding whether
   to enquire should not wait on a hydration pass — so the "framework" is this
   file: it renders each page module to a string at build time and copies the
   static assets next to it. */

import { cp, mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { renderDocument } from "./src/layout.mjs";
import { pages } from "./src/pages/index.mjs";
import { site } from "./site.config.mjs";

const root = dirname(fileURLToPath(import.meta.url));
const outDir = join(root, "dist");
const publicDir = join(root, "public");

/* "/" writes dist/index.html; "/features/customs" writes
   dist/features/customs/index.html so the served URL needs no extension. */
function outputPathFor(route) {
  const clean = route.replace(/^\/+|\/+$/g, "");
  return clean ? join(outDir, clean, "index.html") : join(outDir, "index.html");
}

async function walk(dir, base = dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(full, base)));
    else files.push(relative(base, full));
  }
  return files;
}

function buildSitemap(routes) {
  const urls = routes
    .map((route) => {
      const path = route === "/" ? "/" : `${route}/`;
      const priority = route === "/" ? "1.0" : route.startsWith("/features") ? "0.8" : "0.6";
      return `  <url><loc>${site.origin}${path}</loc><priority>${priority}</priority></url>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

async function build() {
  const started = process.hrtime.bigint();
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  let bytes = 0;
  for (const page of pages) {
    const html = renderDocument(page);
    const target = outputPathFor(page.route);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, html, "utf8");
    bytes += Buffer.byteLength(html);
    console.log(`  ${page.route.padEnd(26)} ${(Buffer.byteLength(html) / 1024).toFixed(1)} kB`);
  }

  await cp(publicDir, outDir, { recursive: true });
  await writeFile(join(outDir, "sitemap.xml"), buildSitemap(pages.map((page) => page.route)), "utf8");

  const assets = await walk(publicDir);
  let assetBytes = 0;
  for (const asset of assets) assetBytes += (await stat(join(publicDir, asset))).size;

  const ms = Number(process.hrtime.bigint() - started) / 1e6;
  console.log(
    `\n${pages.length} pages (${(bytes / 1024).toFixed(1)} kB) + ${assets.length} assets (${(
      assetBytes / 1024
    ).toFixed(1)} kB) in ${ms.toFixed(0)}ms → dist/`,
  );
}

build().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

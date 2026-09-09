// Isolated real component and gallery preview. No Auth, tenant or provider calls.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
const client = fileURLToPath(new URL('../../../multideck.client/', import.meta.url))
const { build } = createRequire(`${client}package.json`)('esbuild')
const gallery = readFileSync(`${client}src/pages/components-gallery-page.tsx`, 'utf8')
const start = gallery.indexOf('function CargoAllocationEditorPreview() {')
if (start < 0) throw Error('Missing real gallery preview')
const preview = gallery.slice(start, gallery.indexOf('function QuoteCargoEditorPreview()', start))
const built = await build({ stdin: { contents: `
  import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
  import {Button} from '@/components/ui/button';import {CargoAllocationEditor} from '@/components/multideck/cargo-allocation-editor';
  ${preview}
  createRoot(document.getElementById('root')).render(<main className="grid min-w-0 gap-4 p-4 text-[13px]"><h1>Cargo allocation QA</h1><CargoAllocationEditorPreview/></main>);
`, loader: 'tsx', resolveDir: client }, bundle: true, write: false, format: 'esm', jsx: 'automatic', alias: { '@': `${client}src` }, plugins: [{ name: 'qa-language', setup(b) {
  b.onResolve({ filter: /i18n\/language-provider$/ }, () => ({ path: 'qa', namespace: 'qa' }))
  b.onLoad({ filter: /.*/, namespace: 'qa' }, () => ({ contents: `export function useLanguage(){return {language:new URLSearchParams(location.search).get('language')==='en-US'?'en-US':'en-GB',direction:'ltr',t:value=>value}}` }))
} }] })
const css = readFileSync(`${client}dist/assets/multideck-app.css`)
const server = createServer((req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  const path = new URL(req.url, 'http://localhost').pathname
  if (path === '/app.js') { res.setHeader('Content-Type', 'text/javascript');return res.end(built.outputFiles[0].text) }
  if (path === '/style.css') { res.setHeader('Content-Type', 'text/css');return res.end(css) }
  res.setHeader('Content-Type', 'text/html')
  res.end('<!doctype html><html lang="en-GB"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><title>Cargo allocation QA</title></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>')
})
server.listen(0, '127.0.0.1', () => console.log('Allocation QA: http://127.0.0.1:' + server.address().port + '/ PID ' + process.pid))
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)))

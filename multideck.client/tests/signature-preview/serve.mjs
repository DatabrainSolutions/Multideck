// Local-only QA for the signature studio: production page and components, fixture transport.
import { join, resolve } from 'node:path'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import tailwind from '@tailwindcss/vite'
const root = resolve(import.meta.dirname, '../..')
const here = import.meta.dirname
const server = await createServer({
  configFile: false, envFile: false, root, cacheDir: '/tmp/md-signature-qa-vite',
  plugins: [react(), tailwind(), { name: 'signature-fixture', configureServer(s) { s.middlewares.use((req, _res, next) => { if (['/', '/company', '/personal'].includes(req.url?.split('?')[0] ?? '')) req.url = '/tests/signature-preview/index.html'; next() }) } }],
  resolve: { dedupe: ['react', 'react-dom'], alias: [
    { find: '@/lib/email-signatures', replacement: join(here, 'mock-signatures.ts') },
    { find: '@/lib/tenant-branding-api', replacement: join(here, 'mock-branding.ts') },
    { find: '@/lib/supabase', replacement: join(here, 'mock-supabase.ts') },
    { find: '@', replacement: join(root, 'src') },
  ] },
  optimizeDeps: { entries: ['tests/signature-preview/main.tsx'] },
  server: { host: '127.0.0.1', port: 3017, strictPort: true },
})
await server.listen(); console.log('Signature QA ready: http://127.0.0.1:3017/company')

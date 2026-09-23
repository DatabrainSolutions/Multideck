// Isolated UI test fixture. Never uses tenant configuration or the shared backend.
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
const root = fileURLToPath(new URL('../', import.meta.url))
const server = await createServer({ configFile: false, envFile: false, root,
  cacheDir: 'node_modules/.vite-booking-planning-fixture',
  optimizeDeps: { entries: ['tests/fixtures/booking-planning/index.html'] },
  plugins: [react(), tailwindcss()],
  resolve: { alias: [
    { find: '@/lib/booking-workflow-api', replacement: `${root}tests/fixtures/booking-planning/api.ts` },
    { find: '@', replacement: `${root}src` },
  ] },
  server: { host: '127.0.0.1', port: 3001, strictPort: true },
})
await server.listen()
console.log('Isolated fixture: http://127.0.0.1:3001/tests/fixtures/booking-planning/index.html')
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await server.close(); process.exit(0) })

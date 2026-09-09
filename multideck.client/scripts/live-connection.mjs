const descriptorPath = '/.well-known/multideck-live.json'
export function createLiveDescriptor(env) {
  if (env.VITE_LIVE_GATEWAY_ENABLED !== 'true') return null
  const slug = env.VITE_MULTIDECK_TENANT_SLUG?.trim()
  const host = env.VITE_MULTIDECK_TENANT_HOST?.trim()
  const ref = env.VITE_SUPABASE_PROJECT_REF?.trim()
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug ?? '') || host !== `${slug}.multideck.app` ||
    !/^[a-z]{20}$/.test(ref ?? '') || env.VITE_SUPABASE_URL?.replace(/\/$/, '') !== `https://${ref}.supabase.co`) {
    throw new Error('Live gateway discovery requires matching App hostname, workspace and Supabase project configuration.')
  }
  return { version: 1, appOrigin: `https://${host}`, workspace: { slug }, projectRef: ref,
    gateway: { url: `https://${ref}.supabase.co/functions/v1/live-company-gateway`, protocol: 'multideck-live-v1',
      operations: ['warehouse.context', 'warehouse.stock', 'warehouse.products', 'warehouse.product.create', 'warehouse.product.rename', 'warehouse.order.submit', 'warehouse.orders', 'warehouse.order.detail'] } }
}
export function liveConnectionPlugin(env) {
  const descriptor = createLiveDescriptor(env)
  return {
    name: 'multideck-live-discovery',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.split('?')[0] !== descriptorPath) return next()
        res.statusCode = descriptor ? 200 : 503
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.setHeader('X-Content-Type-Options', 'nosniff')
        res.end(JSON.stringify(descriptor ?? { error: 'Live connection is not enabled.' }))
      })
    },
    generateBundle() {
      if (descriptor) this.emitFile({ type: 'asset', fileName: descriptorPath.slice(1), source: JSON.stringify(descriptor, null, 2) + '\n' })
    },
  }
}

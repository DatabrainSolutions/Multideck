import path from "node:path"
import fs from "node:fs/promises"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig, loadEnv, type Plugin } from "vite"

const appRoutes = new Set(["/app", "/app/", "/auth", "/auth/", "/components", "/components/", "/customers", "/customers/", "/customers/marlow-apparel", "/customers/marlow-apparel/", "/inbox", "/inbox/", "/documents", "/documents/", "/customs/standalone/export", "/customs/standalone/export/new", "/customs/standalone/import", "/customs/job-related/export", "/customs/job-related/import", "/compliance/screening", "/compliance/screening/"])
const mobileConfigurationPath = "/.well-known/multideck-mobile.json"

type MobileConfiguration = {
  version: 1
  workspace: {
    slug: string
    name: string
  }
  supabase: {
    url: string
    publishableKey: string
  }
}

function createMobileConfiguration(environment: Record<string, string>): MobileConfiguration | null {
  const slug = environment.VITE_MULTIDECK_TENANT_SLUG?.trim().toLowerCase()
  const supabaseUrl = environment.VITE_SUPABASE_URL?.trim()
  const publishableKey = (environment.VITE_SUPABASE_PUBLISHABLE_KEY || environment.VITE_SUPABASE_ANON_KEY)?.trim()

  if (!slug || !supabaseUrl || !publishableKey) return null

  return {
    version: 1,
    workspace: {
      slug,
      name: environment.VITE_MULTIDECK_TENANT_NAME?.trim() || slug,
    },
    supabase: {
      url: supabaseUrl,
      publishableKey,
    },
  }
}

function multideckMobileConfiguration(environment: Record<string, string>): Plugin {
  const configuration = createMobileConfiguration(environment)

  return {
    name: "multideck-mobile-configuration",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.split("?")[0] !== mobileConfigurationPath) {
          next()
          return
        }

        if (!configuration) {
          res.statusCode = 503
          res.setHeader("Content-Type", "application/json; charset=utf-8")
          res.end(JSON.stringify({ error: "Mobile workspace discovery is not configured." }))
          return
        }

        res.statusCode = 200
        res.setHeader("Cache-Control", "public, max-age=300")
        res.setHeader("Content-Type", "application/json; charset=utf-8")
        res.end(JSON.stringify(configuration))
      })
    },
    generateBundle() {
      if (!configuration) return

      this.emitFile({
        type: "asset",
        fileName: mobileConfigurationPath.slice(1),
        source: `${JSON.stringify(configuration, null, 2)}\n`,
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, __dirname, "")

  return {
    plugins: [
      multideckMobileConfiguration(environment),
      {
        name: "multideck-local-app-routes",
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            const pathname = req.url?.split("?")[0]

            if (!pathname || !appRoutes.has(pathname)) {
              next()
              return
            }

            const indexPath = path.resolve(server.config.root, "index.html")
            const html = await fs.readFile(indexPath, "utf-8")
            const transformedHtml = await server.transformIndexHtml(req.url ?? "/", html)

            res.statusCode = 200
            res.setHeader("Content-Type", "text/html")
            res.end(transformedHtml)
          })
        },
      },
      react(),
      tailwindcss(),
    ],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    build: {
      rollupOptions: {
        input: {
          app: path.resolve(__dirname, "index.html"),
        },
        output: {
          entryFileNames: "assets/[name]-[hash].js",
          assetFileNames: (asset) => asset.name === "app.css"
            ? "assets/multideck-app.css"
            : "assets/[name]-[hash][extname]",
        },
      },
    },
  }
})

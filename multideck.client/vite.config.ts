import path from "node:path"
import { execFileSync } from "node:child_process"
import fs from "node:fs/promises"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig, loadEnv } from "vite"

const appRoutes = new Set(["/app", "/app/", "/auth", "/auth/", "/components", "/components/", "/customers", "/customers/", "/customers/marlow-apparel", "/customers/marlow-apparel/", "/inbox", "/inbox/", "/documents", "/documents/", "/customs/standalone/export", "/customs/standalone/export/new", "/customs/standalone/import", "/customs/job-related/export", "/customs/job-related/import"])
const websiteDirectory = path.resolve(__dirname, "../multideck.website")
const websiteOutput = path.join(websiteDirectory, "dist")

function isWebsiteRequest(pathname: string) {
  return pathname === "/"
    || pathname === "/about" || pathname === "/about/"
    || pathname === "/contact" || pathname === "/contact/"
    || pathname === "/pricing" || pathname === "/pricing/"
    || pathname === "/features" || pathname === "/features/" || pathname.startsWith("/features/")
    || pathname === "/favicon.svg" || pathname === "/robots.txt" || pathname === "/sitemap.xml"
    || pathname.startsWith("/assets/")
}

function websiteContentType(filePath: string) {
  const extension = path.extname(filePath)
  if (extension === ".html") return "text/html; charset=utf-8"
  if (extension === ".css") return "text/css; charset=utf-8"
  if (extension === ".js") return "text/javascript; charset=utf-8"
  if (extension === ".svg") return "image/svg+xml"
  if (extension === ".webp") return "image/webp"
  if (extension === ".woff2") return "font/woff2"
  if (extension === ".xml") return "application/xml; charset=utf-8"
  return "application/octet-stream"
}

export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, __dirname, "")
  const websiteEnvironment = { ...process.env, VITE_SUPABASE_URL: environment.VITE_SUPABASE_URL }

  return {
    plugins: [
      {
        name: "multideck-local-website-and-app",
        resolveId(id) {
          if (id === "/assets/marketing-dexter.js") return path.resolve(__dirname, "src/marketing-dexter.tsx")
          return null
        },
        configureServer(server) {
          server.middlewares.use((req, _res, next) => {
            const pathname = req.url?.split("?")[0]
            if (pathname === "/assets/marketing-dexter.js") {
              req.url = "/src/marketing-dexter.tsx"
            } else if (pathname === "/assets/multideck-app.css") {
              req.url = "/src/styles.css"
            }
            next()
          })

          const buildWebsite = () => execFileSync(process.execPath, ["build.mjs"], {
            cwd: websiteDirectory,
            env: websiteEnvironment,
            stdio: "ignore",
          })

          buildWebsite()

          const websiteSources = [
            path.join(websiteDirectory, "src"),
            path.join(websiteDirectory, "public"),
            path.join(websiteDirectory, "site.config.mjs"),
            path.join(websiteDirectory, "build.mjs"),
          ]
          server.watcher.add(websiteSources)
          server.watcher.on("change", (changedPath) => {
            if (!websiteSources.some((source) => changedPath === source || changedPath.startsWith(`${source}${path.sep}`))) return
            buildWebsite()
            server.ws.send({ type: "full-reload", path: "*" })
          })

          server.middlewares.use(async (req, res, next) => {
            const pathname = req.url?.split("?")[0]

            if (!pathname || !isWebsiteRequest(pathname)) {
              next()
              return
            }

            const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\//, "")
            let websiteFile = path.join(websiteOutput, relativePath)
            try {
              if ((await fs.stat(websiteFile)).isDirectory()) websiteFile = path.join(websiteFile, "index.html")
              const body = await fs.readFile(websiteFile)
              res.statusCode = 200
              res.setHeader("Content-Type", websiteContentType(websiteFile))
              res.end(websiteFile.endsWith(".html")
                ? await server.transformIndexHtml(req.url ?? "/", body.toString("utf8"))
                : body)
            } catch (error) {
              if ((error as NodeJS.ErrnoException).code === "ENOENT") {
                next()
                return
              }
              next(error)
            }
          })

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
          "marketing-dexter": path.resolve(__dirname, "src/marketing-dexter.tsx"),
        },
        output: {
          entryFileNames: (chunk) => chunk.name === "marketing-dexter"
            ? "assets/marketing-dexter.js"
            : "assets/[name]-[hash].js",
          assetFileNames: (asset) => asset.name === "app.css"
            ? "assets/multideck-app.css"
            : "assets/[name]-[hash][extname]",
        },
      },
    },
  }
})

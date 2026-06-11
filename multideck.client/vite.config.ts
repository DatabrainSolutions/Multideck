import path from "node:path"
import fs from "node:fs/promises"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "vite"

const appRoutes = new Set(["/components", "/components/", "/customers", "/customers/", "/customers/marlow-apparel", "/customers/marlow-apparel/"])

export default defineConfig({
  plugins: [
    {
      name: "multideck-spa-routes",
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
})

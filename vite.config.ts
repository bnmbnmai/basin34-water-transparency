import fs from 'node:fs'
import path from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import tailwindcss from '@tailwindcss/vite'

/** Serve private/watchlist.json at /watchlist.local.json in `npm run dev` only — never copied to dist/. */
function devWatchlistPlugin(): Plugin {
  return {
    name: 'dev-watchlist',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.split('?')[0] !== '/watchlist.local.json') {
          next()
          return
        }
        const file = path.resolve(server.config.root, 'private/watchlist.json')
        if (!fs.existsSync(file)) {
          res.statusCode = 404
          res.end()
          return
        }
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.setHeader('Cache-Control', 'no-store')
        fs.createReadStream(file).pipe(res)
      })
    },
  }
}

export default defineConfig({
  plugins: [
    tailwindcss(),
    devWatchlistPlugin(),
  ],
})

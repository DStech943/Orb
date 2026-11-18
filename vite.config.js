import { defineConfig } from 'vite'
import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

const createPwaServiceWorker = () => ({
  name: 'orb-pwa-service-worker',
  apply: 'build',
  generateBundle(_, bundle) {
    const assets = Object.keys(bundle)
      .filter((fileName) => fileName !== 'sw.js')
      .map((fileName) => `/${fileName}`)
    const precache = [...new Set([
      '/',
      '/index.html',
      '/manifest.webmanifest',
      '/orb-favicon.png',
      ...assets,
    ])]
    const appEntry = assets.find((fileName) => /^\/assets\/index-.*\.js$/.test(fileName)) || 'shell'
    const source = readFileSync(
      fileURLToPath(new URL('./src/pwa/service-worker.js', import.meta.url)),
      'utf8',
    )
      .replace('__ORB_PWA_CACHE_NAME__', JSON.stringify(`orb-pwa-${appEntry}`))
      .replace('__ORB_PWA_PRECACHE_URLS__', JSON.stringify(precache))

    this.emitFile({ type: 'asset', fileName: 'sw.js', source })
  },
})

export default defineConfig({
  server: {
    port: 5173,
  },
  esbuild: { jsx: 'automatic' },
  plugins: [createPwaServiceWorker()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})

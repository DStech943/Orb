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
    // Precache only what the first screen needs. Fonts and route chunks are cached by the
    // worker the first time they are requested, so installing it never competes with the page
    // for bandwidth (it used to download every chunk and font up front).
    const isCritical = (fileName) => /^\/assets\/(index-.*\.(js|css)|vendor-react-.*\.js)$/.test(fileName)
    const precache = [...new Set([
      '/',
      '/index.html',
      '/manifest.webmanifest',
      '/orb-favicon.png',
      ...assets.filter(isCritical),
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
  build: {
    rollupOptions: {
      output: {
        // Split third-party code into stable chunks: they cache across deploys (app code changes,
        // these rarely do), download in parallel, and heavy ones stay out of pages that skip them.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (/[\/]node_modules[\/](react|react-dom|scheduler|react-router|react-router-dom|@remix-run)[\/]/.test(id)) return 'vendor-react'
          if (/[\/]node_modules[\/](motion|motion-dom|motion-utils|framer-motion)[\/]/.test(id)) return 'vendor-motion'
          if (/[\/]node_modules[\/]@supabase[\/]/.test(id)) return 'vendor-supabase'
          if (/[\/]node_modules[\/](recharts|d3-[^\/]+|victory-vendor|decimal\.js-light|internmap|robust-predicates)[\/]/.test(id)) return 'vendor-charts'
          if (/[\/]node_modules[\/]matter-js[\/]/.test(id)) return 'vendor-physics'
          return undefined
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})

import React from 'react'

export default class AppErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { failed: false, message: '' } }
  static getDerivedStateFromError(error) { return { failed: true, message: error?.message || 'Unknown application error' } }
  componentDidCatch(error) {
    // Vite names every lazy route chunk with a content hash. During a deploy a
    // browser can briefly have the previous app shell while the old chunk has
    // already been removed. Reload once to acquire the matching shell/chunks.
    // Store the failed URL so a genuinely broken current deployment still
    // shows this boundary rather than continuously refreshing the browser.
    const message = String(error?.message || '')
    const isChunkLoadError = /Failed to fetch dynamically imported module|Importing a module script failed|Loading chunk .* failed/i.test(message)
    if (!isChunkLoadError || typeof window === 'undefined') return
    const key = 'orb:last-recovered-chunk-error'
    try {
      if (window.sessionStorage.getItem(key) === message) return
      window.sessionStorage.setItem(key, message)
      window.location.reload()
    } catch {
      // Session storage can be disabled; the manual refresh button remains.
    }
  }
  render() {
    if (this.state.failed) return <main className="grid min-h-screen place-items-center bg-peach p-6"><section className="max-w-md rounded-lg border border-ink/20 bg-white p-6 text-center"><h1 className="text-xl font-extrabold">Orb hit an app error.</h1><p className="mt-2 text-sm text-muted">{this.state.message}</p><button className="mt-5 rounded-md bg-purple px-4 py-2 text-sm font-bold text-white" onClick={() => window.location.reload()}>Refresh Orb</button></section></main>
    return this.props.children
  }
}

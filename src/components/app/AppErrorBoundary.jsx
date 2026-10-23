import React from 'react'

export default class AppErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { failed: false, message: '' } }
  static getDerivedStateFromError(error) { return { failed: true, message: error?.message || 'Unknown application error' } }
  render() {
    if (this.state.failed) return <main className="grid min-h-screen place-items-center bg-peach p-6"><section className="max-w-md rounded-lg border border-ink/20 bg-white p-6 text-center"><h1 className="text-xl font-extrabold">Orb hit an app error.</h1><p className="mt-2 text-sm text-muted">{this.state.message}</p><button className="mt-5 rounded-md bg-purple px-4 py-2 text-sm font-bold text-white" onClick={() => window.location.reload()}>Refresh Orb</button></section></main>
    return this.props.children
  }
}

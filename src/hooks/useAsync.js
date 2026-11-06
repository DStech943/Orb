import { useCallback, useEffect, useState } from 'react'

// Keep already-rendered content on screen while a manual refresh happens.
// This avoids replacing an entire library or canvas with a full-page loader
// every time a user saves, changes a small setting, or switches back to it.
export default function useAsync(fn, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true, refreshing: false })
  const run = useCallback(async () => {
    setState((value) => ({ ...value, loading: value.data === null, refreshing: value.data !== null, error: null }))
    try {
      const data = await fn()
      setState({ data, error: null, loading: false, refreshing: false })
      return data
    } catch (error) {
      setState((value) => ({ data: value.data, error, loading: false, refreshing: false }))
      return null
    }
  }, deps)
  useEffect(() => { run() }, [run])
  return { ...state, reload: run }
}

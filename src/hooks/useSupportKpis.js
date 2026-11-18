import { useCallback, useEffect, useRef, useState } from 'react'
import { useBrand } from '../context/BrandContext'
import { getSupportPerformance } from '../services/aiAnalytics'

const rangeKey = (range) => (typeof range === 'string' ? range : `${range?.id || '30d'}|${range?.from || ''}|${range?.to || ''}`)

/**
 * Support performance (incoming, handled, resolved, replies, response times) for the selected
 * brand and range. Loaded on its own, so a slow or failing request here never blocks the rest of
 * the page. `status` is 'idle' (no brand yet), 'loading', 'ready' or 'error'.
 */
export default function useSupportKpis(range = '30d') {
  const { brand, brandId } = useBrand()
  const usable = Boolean(brandId) && !brand?.isPlaceholder
  const [state, setState] = useState({ status: 'idle', data: null, error: '' })
  const ticket = useRef(0)
  const rangeRef = useRef(range)
  rangeRef.current = range
  const key = rangeKey(range)

  const load = useCallback(async () => {
    if (!usable) {
      setState({ status: 'idle', data: null, error: '' })
      return
    }
    const mine = ++ticket.current
    setState((current) => ({ status: 'loading', data: current.data?.brand_id === brandId ? current.data : null, error: '' }))
    try {
      const data = await getSupportPerformance(brandId, rangeRef.current)
      if (mine === ticket.current) setState({ status: 'ready', data, error: '' })
    } catch (cause) {
      if (mine === ticket.current) setState({ status: 'error', data: null, error: cause?.message || 'Could not load support performance.' })
    }
  }, [usable, brandId, key])

  useEffect(() => {
    load()
  }, [load])

  return { ...state, reload: load }
}

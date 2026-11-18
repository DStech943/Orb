import { useCallback, useEffect, useRef, useState } from 'react'
import { useBrand } from '../context/BrandContext'
import { getAiPerformanceMetrics } from '../services/aiAnalytics'

/**
 * Loads real analytics for the selected brand.
 *
 * `status` is one of: 'idle' (no brand yet), 'loading', 'ready', 'error'. While the brand
 * list is still loading the brand context holds a placeholder brand; analytics are never
 * requested for it.
 */
export default function useBrandAnalytics(rangeId = '30d') {
  const { brand, brandId, loading: brandsLoading } = useBrand()
  const usable = Boolean(brandId) && !brand?.isPlaceholder
  const [state, setState] = useState({ status: 'idle', data: null, error: '' })
  const request = useRef(0)

  const load = useCallback(async () => {
    if (!usable) {
      setState({ status: brandsLoading ? 'loading' : 'idle', data: null, error: '' })
      return
    }
    const ticket = ++request.current
    setState((current) => ({ status: 'loading', data: current.data?.brand_id === brandId ? current.data : null, error: '' }))
    try {
      const data = await getAiPerformanceMetrics(brandId, rangeId)
      if (ticket === request.current) setState({ status: 'ready', data, error: '' })
    } catch (cause) {
      if (ticket === request.current) setState({ status: 'error', data: null, error: cause?.message || 'Could not load analytics.' })
    }
  }, [usable, brandId, rangeId, brandsLoading])

  useEffect(() => {
    load()
  }, [load])

  return { ...state, brandId, reload: load }
}

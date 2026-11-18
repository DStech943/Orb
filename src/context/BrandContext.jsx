import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { invalidateBrandCache, listBrands } from '../services/brands'
import { useAuth } from './AuthContext'

/**
 * The single source of truth for "which brand workspace am I in?".
 *
 * Existing pages and services still read the selected brand from localStorage
 * (`orb_selected_brand*`) and refetch on the `orb:brand-changed` window event. This
 * provider keeps that contract intact, so nothing downstream had to change, while
 * giving the new shell one place to read from.
 *
 * Selection is a UI convenience only. The list of brands comes from the API, which
 * scopes it to what the signed-in user may access, and every data request is
 * authorised server-side.
 */
const BrandContext = createContext(null)

const STORAGE_KEYS = { id: 'orb_selected_brand', name: 'orb_selected_brand_name', agent: 'orb_selected_brand_agent_name' }

const readStored = () => {
  try {
    return window.localStorage.getItem(STORAGE_KEYS.id) || ''
  } catch {
    return ''
  }
}

export function BrandProvider({ children }) {
  const { user } = useAuth()
  const [brands, setBrands] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedId, setSelectedId] = useState(readStored)
  const published = useRef('')

  const load = useCallback(async ({ fresh = false } = {}) => {
    if (fresh) invalidateBrandCache()
    try {
      const result = await listBrands()
      setBrands(Array.isArray(result) ? result : [])
      setError(null)
    } catch (failure) {
      setError(failure)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load, user?.id])

  // Other screens (voice setup, category setup, settings) announce edits to the active brand.
  useEffect(() => {
    const onForeignChange = (event) => {
      if (event?.detail?.__fromBrandProvider) return
      load({ fresh: true })
    }
    window.addEventListener('orb:brand-changed', onForeignChange)
    return () => window.removeEventListener('orb:brand-changed', onForeignChange)
  }, [load])

  // Fall back to the first accessible brand if the stored one is unavailable to this user.
  const brand = useMemo(() => {
    if (!brands.length) return null
    return brands.find((item) => item.id === selectedId) || brands[0]
  }, [brands, selectedId])

  // A layout effect, so the selected brand is already in localStorage before any page's
  // own effects run and read it.
  useLayoutEffect(() => {
    if (!brand) return
    const signature = `${brand.id}|${brand.name}|${brand.ai_agent_name || ''}`
    if (published.current === signature) return
    published.current = signature
    try {
      window.localStorage.setItem(STORAGE_KEYS.id, brand.id)
      window.localStorage.setItem(STORAGE_KEYS.name, brand.name)
      window.localStorage.setItem(STORAGE_KEYS.agent, brand.ai_agent_name || '')
    } catch {
      // Private mode: the in-memory selection still works for this tab.
    }
    window.dispatchEvent(new CustomEvent('orb:brand-changed', { detail: { ...brand, __fromBrandProvider: true } }))
  }, [brand])

  const selectBrand = useCallback((id) => setSelectedId(id), [])

  const value = useMemo(
    () => ({
      brands,
      brand,
      brandId: brand?.id || '',
      brandName: brand?.name || '',
      agentName: String(brand?.ai_agent_name || '').trim() || 'AI',
      loading,
      error,
      // The list is already limited to the user's accessible brands by the API.
      canSwitch: brands.length > 1,
      selectBrand,
      refresh: () => load({ fresh: true }),
    }),
    [brands, brand, loading, error, selectBrand, load],
  )

  return <BrandContext.Provider value={value}>{children}</BrandContext.Provider>
}

export function useBrand() {
  const context = useContext(BrandContext)
  if (!context) throw new Error('useBrand must be used within BrandProvider')
  return context
}

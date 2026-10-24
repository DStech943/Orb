import { useEffect, useMemo, useState } from 'react'
import Button from '../ui/Button'
import Select from '../ui/Select'
import { useToast } from '../../context/ToastContext'
import { listBrands } from '../../services/brands'
import { hasOrbApi, listBrandCategories, setRemoteBrandCategory } from '../../services/orbApi'

function setActiveBrand(brand) {
  window.localStorage.setItem('orb_selected_brand', brand.id)
  window.localStorage.setItem('orb_selected_brand_name', brand.name)
  window.dispatchEvent(new CustomEvent('orb:brand-changed', { detail: brand }))
}

export default function BrandCategorySetup({ isAdmin }) {
  const { showToast } = useToast()
  const [brands, setBrands] = useState([])
  const [categories, setCategories] = useState([])
  const [brandId, setBrandId] = useState(() => window.localStorage.getItem('orb_selected_brand') || '')
  const [category, setCategory] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isAdmin) return undefined
    let live = true
    const load = async () => {
      setLoading(true)
      setError('')
      try {
        const [brandList, categoryResponse] = await Promise.all([listBrands(), listBrandCategories()])
        if (!live) return
        const nextBrands = Array.isArray(brandList) ? brandList : []
        const currentId = window.localStorage.getItem('orb_selected_brand') || ''
        const nextId = nextBrands.some((brand) => brand.id === currentId) ? currentId : nextBrands[0]?.id || ''
        setBrands(nextBrands)
        setCategories(Array.isArray(categoryResponse?.categories) ? categoryResponse.categories : [])
        setBrandId(nextId)
        setCategory(nextBrands.find((brand) => brand.id === nextId)?.industry_category || '')
      } catch (loadError) {
        if (live) setError(loadError.message || 'Could not load brand categories.')
      } finally {
        if (live) setLoading(false)
      }
    }
    load()
    return () => { live = false }
  }, [isAdmin])

  useEffect(() => {
    const onBrandChange = (event) => {
      const next = event.detail
      if (!next?.id) return
      setBrandId(next.id)
      setCategory(next.industry_category || brands.find((brand) => brand.id === next.id)?.industry_category || '')
    }
    window.addEventListener('orb:brand-changed', onBrandChange)
    return () => window.removeEventListener('orb:brand-changed', onBrandChange)
  }, [brands])

  const selectedBrand = useMemo(() => brands.find((brand) => brand.id === brandId), [brands, brandId])
  const selectBrand = (id) => {
    const next = brands.find((brand) => brand.id === id)
    setBrandId(id)
    setCategory(next?.industry_category || '')
    if (next) setActiveBrand(next)
  }
  const save = async () => {
    if (!selectedBrand || !category) return
    setSaving(true)
    setError('')
    try {
      const result = await setRemoteBrandCategory(selectedBrand.id, category)
      const updated = result.brand
      setBrands((items) => items.map((brand) => brand.id === updated.id ? updated : brand))
      setActiveBrand(updated)
      showToast(`${updated.name}'s category was saved.`)
    } catch (saveError) {
      setError(saveError.message || 'Could not save the category.')
    } finally {
      setSaving(false)
    }
  }

  if (!isAdmin) return <p className="rounded-md border border-ink/15 bg-peach p-3 text-sm text-muted">An administrator chooses the category used for SOP templates.</p>
  if (!hasOrbApi && !loading) return <p className="rounded-md border border-ink/15 bg-peach p-3 text-sm text-muted">Start the Orb backend to choose a category and load its SOP templates.</p>

  return <section className="mb-6 rounded-lg border-2 border-ink bg-peach p-4 sm:p-5">
    <p className="text-xs font-extrabold uppercase tracking-widest text-purple">SOP generation</p>
    <h3 className="mt-1 text-xl font-extrabold tracking-tight">Brand category</h3>
    <p className="mt-1 max-w-2xl text-sm text-muted">Choose the category for the active brand. Orb uses it to select the matching SOP template before generation.</p>
    <div className="mt-4 grid gap-4 md:grid-cols-2">
      <Select label="Brand" value={brandId} onChange={(event) => selectBrand(event.target.value)} disabled={loading || !brands.length}>
        <option value="">{loading ? 'Loading brands…' : 'Choose a brand'}</option>
        {brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
      </Select>
      <Select label="Category" value={category} onChange={(event) => setCategory(event.target.value)} disabled={loading || !selectedBrand}>
        <option value="">Choose a category</option>
        {categories.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
      </Select>
    </div>
    {error && <p className="mt-3 text-sm font-semibold text-red-700" role="alert">{error}</p>}
    <Button variant="purple" className="mt-4" onClick={save} disabled={loading || saving || !selectedBrand || !category}>{saving ? 'Saving…' : 'Save category'}</Button>
  </section>
}

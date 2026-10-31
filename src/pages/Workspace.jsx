import React, { useEffect, useState } from 'react'
import { Plus, Trash2, Upload } from 'lucide-react'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import Modal from '../components/ui/Modal'
import Tabs from '../components/ui/Tabs'
import Textarea from '../components/ui/Textarea'
import BrandCategorySetup from '../components/app/BrandCategorySetup'
import BrandVoiceSetup from '../components/app/BrandVoiceSetup'
import SourcePicker from '../components/app/SourcePicker'
import useAsync from '../hooks/useAsync'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { addSource, deleteProduct, listProducts, listSources, removeSource, saveProduct, seedSampleData } from '../services/generation'
import { listBrands } from '../services/brands'
import { hasOrbApi, setRemoteBrandProfile } from '../services/orbApi'

const tabs = [
  { id: 'business', label: 'Business' },
  { id: 'voice', label: 'Brand voice' },
  { id: 'products', label: 'Products' },
  { id: 'sources', label: 'Sources' },
]

export default function Workspace() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [active, setActive] = useState('business')
  const [productModal, setProductModal] = useState(false)
  const [business, setBusiness] = useState({ id: '', name: '', website_url: '', support_email: '', description: '' })
  const [businessLoading, setBusinessLoading] = useState(true)
  const [savingBusiness, setSavingBusiness] = useState(false)
  const [product, setProduct] = useState({ name: '', price: '', url: '', description: '' })
  const products = useAsync(listProducts, [])
  const sources = useAsync(listSources, [])

  useEffect(() => {
    let live = true
    const loadBusiness = async () => {
      setBusinessLoading(true)
      try {
        const brands = await listBrands()
        if (!live) return
        const activeId = window.localStorage.getItem('orb_selected_brand') || ''
        const brand = brands.find((item) => item.id === activeId) || brands[0]
        if (brand) {
          setBusiness({ id: brand.id, name: brand.name, website_url: brand.profile?.website_url || '', support_email: brand.profile?.support_email || '', description: brand.description || '' })
        }
      } finally {
        if (live) setBusinessLoading(false)
      }
    }
    const onBrandChange = () => loadBusiness()
    loadBusiness()
    window.addEventListener('orb:brand-changed', onBrandChange)
    return () => { live = false; window.removeEventListener('orb:brand-changed', onBrandChange) }
  }, [])

  const saveBusiness = async () => {
    if (!business.id) return
    if (!hasOrbApi) return showToast('Start the Orb backend to save the brand profile.')
    setSavingBusiness(true)
    try {
      const result = await setRemoteBrandProfile(business.id, {
        website_url: business.website_url,
        support_email: business.support_email,
        description: business.description,
      })
      const updated = result.brand
      setBusiness({ id: updated.id, name: updated.name, website_url: updated.profile?.website_url || '', support_email: updated.profile?.support_email || '', description: updated.description || '' })
      showToast('Brand profile saved.')
    } catch (error) {
      showToast(error.message || 'Could not save the brand profile.')
    } finally {
      setSavingBusiness(false)
    }
  }
  const add = async (source) => { await addSource(source); sources.reload(); showToast('Source added.') }
  const remove = async (id) => { await removeSource(id); sources.reload(); showToast('Source removed.') }
  const saveNewProduct = async (event) => {
    event.preventDefault()
    await saveProduct(product)
    setProductModal(false)
    setProduct({ name: '', price: '', url: '', description: '' })
    products.reload()
    showToast('Product saved.')
  }

  return <div className="mx-auto max-w-6xl">
    <p className="text-xs font-extrabold uppercase tracking-widest text-purple">Brand workspace</p>
    <h2 className="mt-1 text-3xl font-extrabold tracking-tight">Build your brand knowledge</h2>
    <p className="mt-2 max-w-2xl text-sm text-muted">Set the active brand's category, voice, products, and source material before generating knowledge.</p>
    <section className="mt-6 rounded-lg border-2 border-ink bg-white shadow-brutal">
      <Tabs tabs={tabs} active={active} onChange={setActive} />
      <div className="p-5 sm:p-6">
        {active === 'business' && <>
          <BrandCategorySetup isAdmin={user?.role === 'admin'} />
          <div className="mt-6 grid max-w-2xl gap-4 border-t border-ink/15 pt-6">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-widest text-purple">Brand profile</p>
              <h3 className="mt-1 text-xl font-extrabold">Useful context for Orb</h3>
              <p className="mt-1 text-sm text-muted">The brand name is managed from the top bar. Category is saved above and controls SOP templates.</p>
            </div>
            <div className="rounded-md border border-ink/15 bg-peach px-4 py-3 text-sm"><span className="font-bold">Active brand:</span> {business.name || 'Choose a brand in the top bar'}</div>
            <Input label="Primary website" type="url" placeholder="https://yourbrand.com" value={business.website_url} onChange={(event) => setBusiness({ ...business, website_url: event.target.value })} disabled={businessLoading || !business.id} />
            <Input label="Support email" type="email" placeholder="support@yourbrand.com" value={business.support_email} onChange={(event) => setBusiness({ ...business, support_email: event.target.value })} disabled={businessLoading || !business.id} />
            <Textarea label="About this brand" placeholder="What the brand sells, key policies, or useful context for drafted content." value={business.description} onChange={(event) => setBusiness({ ...business, description: event.target.value })} disabled={businessLoading || !business.id} />
            <Button variant="purple" onClick={saveBusiness} disabled={businessLoading || savingBusiness || !business.id}>{savingBusiness ? 'Saving…' : 'Save brand profile'}</Button>
          </div>
        </>}
        {active === 'voice' && <BrandVoiceSetup isAdmin={user?.role === 'admin'} />}
        {active === 'products' && <div>
          <div className="flex flex-wrap justify-between gap-3"><div><h3 className="text-xl font-extrabold">Product catalog</h3><p className="text-sm text-muted">Generated products appear here for correction.</p></div><div className="flex gap-2"><Button variant="outline"><Upload size={15} />Import CSV</Button><Button variant="purple" onClick={() => setProductModal(true)}><Plus size={15} />Add product</Button></div></div>
          <div className="mt-5 overflow-x-auto rounded-lg border border-ink/20"><table className="w-full text-left text-sm"><thead><tr className="border-b border-ink/20 text-xs uppercase"><th className="p-3">Name</th><th>Price</th><th>URL</th><th>Description</th><th /></tr></thead><tbody>{products.data?.map((item) => <tr key={item.id} className="border-b border-ink/10"><td className="p-3 font-bold">{item.name}</td><td>{item.price}</td><td className="max-w-36 truncate">{item.url}</td><td>{item.description}</td><td><button onClick={async () => { await deleteProduct(item.id); products.reload() }} aria-label={`Delete ${item.name}`}><Trash2 size={16} /></button></td></tr>)}</tbody></table></div>
        </div>}
        {active === 'sources' && <div><div className="flex flex-wrap justify-between gap-3"><div><h3 className="text-xl font-extrabold">Sources</h3><p className="text-sm text-muted">Websites, files, and pasted text used by Orb.</p></div><button className="text-sm font-bold underline" onClick={async () => { await seedSampleData(); sources.reload(); showToast('Sample data loaded.') }}>Load sample data</button></div><div className="mt-5"><SourcePicker sources={sources.data || []} onAdd={add} onRemove={remove} /></div></div>}
      </div>
    </section>
    <Modal open={productModal} onClose={() => setProductModal(false)} title="Add product">
      <form className="grid gap-4" onSubmit={saveNewProduct}>
        <Input label="Name" value={product.name} onChange={(event) => setProduct({ ...product, name: event.target.value })} />
        <Input label="Price" value={product.price} onChange={(event) => setProduct({ ...product, price: event.target.value })} />
        <Input label="URL" value={product.url} onChange={(event) => setProduct({ ...product, url: event.target.value })} />
        <Textarea label="Short description" value={product.description} onChange={(event) => setProduct({ ...product, description: event.target.value })} />
        <Button variant="purple" type="submit">Save product</Button>
      </form>
    </Modal>
  </div>
}

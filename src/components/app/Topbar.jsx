import React, { useEffect, useState } from 'react'
import { Bell, ChevronDown, Menu, Search } from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import Avatar from '../ui/Avatar'
import Dropdown from '../ui/Dropdown'
import useAsync from '../../hooks/useAsync'
import { listBrands } from '../../services/brands'
import { useAuth } from '../../context/AuthContext'

const titles = { '/app': 'Overview', '/app/sops': 'SOPs', '/app/faqs': 'FAQs', '/app/products': 'Products', '/app/settings': 'Settings' }

export default function Topbar({ onMenu }) {
  const location = useLocation(); const navigate = useNavigate(); const { user, logout } = useAuth(); const title = titles[location.pathname] || 'Orb'
  const { data: fetchedBrands, loading: brandsLoading } = useAsync(listBrands, [])
  const brands = Array.isArray(fetchedBrands) ? fetchedBrands : []
  const [brandId, setBrandId] = useState(() => localStorage.getItem('orb_selected_brand') || '')
  useEffect(() => {
    if (!brands.length) return
    if (!brands.some((brand) => brand.id === brandId)) setBrandId(brands[0].id)
  }, [brandId, brands])
  useEffect(() => {
    const brand = brands.find((item) => item.id === brandId)
    if (!brand) return
    localStorage.setItem('orb_selected_brand', brand.id)
    localStorage.setItem('orb_selected_brand_name', brand.name)
    window.dispatchEvent(new CustomEvent('orb:brand-changed', { detail: brand }))
  }, [brandId, brands])
  const signOut = async () => { await logout(); navigate('/login') }
  return <header className="sticky top-0 z-20 border-b-2 border-ink bg-white px-4 py-3 sm:px-6"><div className="flex items-center gap-3"><button className="lg:hidden" aria-label="Open navigation" onClick={onMenu}><Menu /></button><h1 className="mr-auto text-lg font-extrabold tracking-tight sm:text-xl">{title}</h1><label className="hidden w-56 items-center gap-2 rounded-md border-2 border-ink bg-white px-3 py-2 md:flex"><Search size={16} /><input className="min-w-0 flex-1 text-sm outline-none" placeholder="Search SOPs and FAQs" aria-label="Search SOPs and FAQs" /></label>{user?.role === 'admin' && <label className="hidden items-center gap-2 rounded-md border-2 border-ink bg-white px-2 py-2 text-xs font-bold sm:flex"><span className="text-muted">Brand</span><select aria-label="Select active brand" value={brandId} onChange={(event) => setBrandId(event.target.value)} className="max-w-36 bg-transparent outline-none" disabled={brandsLoading || brands.length === 0}><option value="">{brandsLoading ? 'Loading…' : brands.length ? 'Choose brand' : 'No brands'}</option>{brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}</select></label>}<button className="relative grid h-9 w-9 place-items-center" aria-label="Notifications"><Bell size={19} /><span className="absolute right-1 top-1 h-2 w-2 border border-ink bg-orange" /></button><Dropdown trigger={({ open, toggle }) => <button className="flex items-center gap-1" aria-haspopup="menu" aria-expanded={open} onClick={toggle}><Avatar name={user?.name} /><ChevronDown size={15} /></button>}><div className="border-b border-ink/10 px-3 py-2"><p className="text-[10px] font-extrabold uppercase tracking-wider text-muted">Role</p><p className="mt-1 text-xs font-bold capitalize">{user?.role || 'client'}</p></div><Link role="menuitem" to="/app/settings?tab=profile" className="block px-3 py-2 text-sm font-bold hover:bg-peach">Profile</Link>{user?.role === 'admin' && <Link role="menuitem" to="/app/settings?tab=team" className="block px-3 py-2 text-sm font-bold hover:bg-peach">Manage roles</Link>}<button role="menuitem" className="block w-full px-3 py-2 text-left text-sm font-bold hover:bg-peach" onClick={signOut}>Log out</button></Dropdown></div></header>
}

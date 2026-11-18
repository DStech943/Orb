import React, { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from '../components/app/Sidebar'
import Topbar from '../components/app/Topbar'
import OrbGuide from '../components/app/OrbGuide'
import Drawer from '../components/ui/Drawer'
import OrbLoader from '../components/ui/OrbLoader'
import { BrandProvider, useBrand } from '../context/BrandContext'

// Pages are re-created whenever the brand changes (`key={brandId}`), so every screen
// loads its data again for the newly selected workspace and nothing from the previous
// brand can linger in component state.
function Workspace({ children }) {
  const { loading, brandId } = useBrand()
  if (loading) return <OrbLoader compact label="Opening your workspace" />
  // Fade only: a transform animation here would become the containing block for the
  // full-screen flow editor and for fixed overlays rendered inside pages.
  return <div key={brandId || 'no-brand'} className="animate-fade-in">{children}</div>
}

export default function AppLayout() {
  const [open, setOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem('orb:sidebar-collapsed') === 'true'
    } catch {
      return false
    }
  })

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev
      try {
        localStorage.setItem('orb:sidebar-collapsed', String(next))
      } catch {
        // Preference simply will not persist.
      }
      return next
    })
  }

  // Marks the document as the signed-in app, so shared rules (corner radii) also reach dialogs
  // and menus that render outside this component's tree.
  useEffect(() => {
    document.body.classList.add('in-app')
    return () => document.body.classList.remove('in-app')
  }, [])

  const location = useLocation()
  const isFlowCanvas = location.pathname === '/app/flows'

  return (
    <BrandProvider>
      <div className={`app-shell min-h-screen bg-canvas transition-[padding] duration-200 ${collapsed ? 'lg:pl-[72px]' : 'lg:pl-64'}`}>
        <div className={`fixed inset-y-0 left-0 z-30 hidden transition-[width] duration-200 lg:block ${collapsed ? 'w-[72px]' : 'w-64'}`}>
          <Sidebar collapsed={collapsed} onToggleCollapse={toggleCollapsed} />
        </div>
        <Drawer open={open} onClose={() => setOpen(false)} title="Orb navigation" side="left" width="max-w-[300px]" bare>
          <Sidebar mobile onClose={() => setOpen(false)} />
        </Drawer>
        <Topbar onMenu={() => setOpen(true)} collapsed={collapsed} onToggleCollapse={toggleCollapsed} />
        <main className="min-h-[calc(100vh-57px)] p-4 sm:p-6">
          <Workspace>
            <Outlet />
          </Workspace>
        </main>
        {!isFlowCanvas && <OrbGuide />}
      </div>
    </BrandProvider>
  )
}

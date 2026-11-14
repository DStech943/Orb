import React, { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from '../components/app/Sidebar'
import Topbar from '../components/app/Topbar'
import OrbGuide from '../components/app/OrbGuide'
import Drawer from '../components/ui/Drawer'
import useAsync from '../hooks/useAsync'
import { getOverviewData } from '../services/generation'

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
      } catch {}
      return next
    })
  }

  const location = useLocation()
  const { data } = useAsync(getOverviewData, [])
  const sops = data?.sops?.length || 0
  const faqs = data?.faqs?.length || 0
  const counts = { brain: sops + faqs, products: data?.products?.length || 0 }
  const isFlowCanvas = location.pathname === '/app/flows'

  return (
    <div
      className={`app-shell min-h-screen bg-[#E6E9EF] transition-[padding] duration-200 ${
        collapsed ? 'lg:pl-16' : 'lg:pl-64'
      }`}
    >
      <div
        className={`fixed inset-y-0 left-0 z-30 hidden transition-[width] duration-200 lg:block ${
          collapsed ? 'w-16' : 'w-64'
        }`}
      >
        <Sidebar
          counts={counts}
          collapsed={collapsed}
          onToggleCollapse={toggleCollapsed}
        />
      </div>
      <Drawer open={open} onClose={() => setOpen(false)} title="Orb navigation" side="left">
        <Sidebar mobile counts={counts} onClose={() => setOpen(false)} />
      </Drawer>
      <Topbar
        onMenu={() => setOpen(true)}
        collapsed={collapsed}
        onToggleCollapse={toggleCollapsed}
      />
      <main className="min-h-[calc(100vh-66px)] p-4 sm:p-6">
        <Outlet />
      </main>
      {!isFlowCanvas && <OrbGuide />}
    </div>
  )
}

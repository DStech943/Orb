import React, { useState } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from '../components/app/Sidebar'
import Topbar from '../components/app/Topbar'
import Drawer from '../components/ui/Drawer'
import useAsync from '../hooks/useAsync'
import { getOverviewData } from '../services/generation'
export default function AppLayout() { const [open, setOpen] = useState(false); const { data } = useAsync(getOverviewData, []); const counts = { sops: data?.sops?.length || 0, faqs: data?.faqs?.length || 0 }; return <div className="app-shell min-h-screen bg-peach lg:pl-64"><div className="fixed inset-y-0 left-0 z-30 hidden w-64 lg:block"><Sidebar counts={counts} /></div><Drawer open={open} onClose={() => setOpen(false)} title="Orb navigation" side="left"><Sidebar mobile counts={counts} onClose={() => setOpen(false)} /></Drawer><Topbar onMenu={() => setOpen(true)} /><main className="min-h-[calc(100vh-66px)] p-4 sm:p-6"><Outlet /></main></div> }

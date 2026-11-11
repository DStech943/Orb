import React, { useEffect, useState } from 'react'
import {
  Bot,
  BrainCircuit,
  BriefcaseBusiness,
  ClipboardPenLine,
  FileText,
  GitBranch,
  LayoutGrid,
  MessageSquare,
  PackageSearch,
  Settings,
  Wrench,
  X,
} from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { listBrands } from '../../services/brands'

export default function Sidebar({ mobile = false, onClose, counts = {} }) {
  const [agentName, setAgentName] = useState('AI')

  useEffect(() => {
    let live = true
    const loadAgentName = async () => {
      const brands = await listBrands()
      if (!live) return
      const selectedId = window.localStorage.getItem('orb_selected_brand') || ''
      const brand = brands.find((item) => item.id === selectedId) || brands[0]
      setAgentName(String(brand?.ai_agent_name || 'AI').trim() || 'AI')
    }
    loadAgentName()
    window.addEventListener('orb:brand-changed', loadAgentName)
    return () => {
      live = false
      window.removeEventListener('orb:brand-changed', loadAgentName)
    }
  }, [])

  const links = [
    { to: '/app', label: 'Overview', icon: LayoutGrid, end: true },
    { to: '/app/workspace', label: 'Brand workspace', icon: BriefcaseBusiness },
    { to: '/app/client-chat', label: 'Client Chatspace', icon: MessageSquare },
    { to: '/app/operations', label: 'Operations', icon: ClipboardPenLine },
    { to: '/app/brain', label: "AI's Brain", icon: BrainCircuit, count: 'brain' },
    { to: '/app/chat', label: `Chat with ${agentName}`, icon: Bot },
    { to: '/app/flows', label: 'Flows', icon: GitBranch },
    { to: '/app/templates', label: 'Templates', icon: FileText },
    { to: '/app/products', label: 'Products', icon: PackageSearch, count: 'products' },
    { to: '/app/tools', label: 'Tools', icon: Wrench },
    { to: '/app/settings', label: 'Settings', icon: Settings },
  ]

  return (
    <aside
      className={`flex h-full w-64 flex-col bg-white p-4 ${
        mobile ? '' : 'border-r border-ink/20'
      }`}
    >
      <div className="mb-8 flex items-center justify-between">
        <NavLink to="/" className="orb-wordmark text-2xl font-extrabold tracking-tight">
          Orb<span className="text-purple">.</span>
        </NavLink>
        {mobile && (
          <button aria-label="Close navigation" onClick={onClose}>
            <X />
          </button>
        )}
      </div>
      <nav aria-label="App navigation" className="grid gap-2">
        {links.map(({ to, label, icon: Icon, end, count }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onClose}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-md px-3 py-3 text-sm font-extrabold transition ${
                isActive ? 'bg-purple text-white' : 'hover:bg-peach'
              }`
            }
          >
            <Icon size={18} />
            <span className="min-w-0 truncate">{label}</span>
            {count && counts[count] > 0 && (
              <span
                className={`ml-auto rounded-full px-2 py-0.5 text-[10px] ${
                  isNaN(counts[count]) ? '' : 'bg-white/25'
                }`}
              >
                {counts[count]}
              </span>
            )}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}

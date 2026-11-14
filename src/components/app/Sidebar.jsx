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
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Wrench,
  X,
} from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { listBrands } from '../../services/brands'
import { getChatspaceUnreadStatus, getUnreadChatCount, markChatspaceAsRead, wsClient } from '../../services/clientChat'
import { activeBrandName } from '../../services/orbApi'

export default function Sidebar({
  mobile = false,
  onClose,
  counts = {},
  collapsed = false,
  onToggleCollapse,
}) {
  const { user } = useAuth() || {}
  const [agentName, setAgentName] = useState('AI')
  const [chatUnread, setChatUnread] = useState(0)
  const [chatMentioned, setChatMentioned] = useState(false)
  const [chatMentionCount, setChatMentionCount] = useState(0)

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

  useEffect(() => {
    const brand = activeBrandName()
    if (brand) {
      wsClient.connect(brand)
    }
    const updateUnread = () => {
      const active = activeBrandName()
      if (active) wsClient.connect(active)
      const status = getChatspaceUnreadStatus(active, user)
      setChatUnread(status.unreadCount)
      setChatMentioned(status.hasMention)
      setChatMentionCount(status.mentionCount)
    }
    updateUnread()

    window.addEventListener('orb:client-chat-updated', updateUnread)
    window.addEventListener('orb:chatspace-unread-changed', updateUnread)
    window.addEventListener('orb:brand-changed', updateUnread)
    return () => {
      window.removeEventListener('orb:client-chat-updated', updateUnread)
      window.removeEventListener('orb:chatspace-unread-changed', updateUnread)
      window.removeEventListener('orb:brand-changed', updateUnread)
    }
  }, [user])

  const links = [
    { to: '/app', label: 'Overview', icon: LayoutGrid, end: true },
    { to: '/app/workspace', label: 'Brand workspace', icon: BriefcaseBusiness },
    { to: '/app/client-chat', label: 'Chatspace', icon: MessageSquare, count: 'chatspace' },
    { to: '/app/operations', label: 'Operations', icon: ClipboardPenLine },
    { to: '/app/brain', label: "AI's Brain", icon: BrainCircuit, count: 'brain' },
    { to: '/app/chat', label: `Chat with ${agentName}`, icon: Bot },
    { to: '/app/flows', label: 'Flows', icon: GitBranch },
    { to: '/app/templates', label: 'Templates', icon: FileText },
    { to: '/app/products', label: 'Products', icon: PackageSearch, count: 'products' },
    { to: '/app/tools', label: 'Tools', icon: Wrench },
    { to: '/app/settings', label: 'Settings', icon: Settings },
  ]

  const isCollapsed = collapsed && !mobile

  return (
    <aside
      className={`flex h-full flex-col bg-white transition-[width,padding] duration-200 ${
        isCollapsed ? 'w-16 px-2 py-4' : 'w-64 p-4'
      } ${mobile ? '' : 'border-r border-ink/20'}`}
    >
      <div
        className={`mb-8 flex items-center ${
          isCollapsed ? 'justify-center' : 'justify-between'
        }`}
      >
        {isCollapsed ? (
          <NavLink
            to="/"
            className="orb-wordmark text-xl font-extrabold tracking-tight"
            title="Orb"
          >
            O<span className="text-purple">.</span>
          </NavLink>
        ) : (
          <NavLink
            to="/"
            className="orb-wordmark text-2xl font-extrabold tracking-tight"
          >
            Orb<span className="text-purple">.</span>
          </NavLink>
        )}
        {mobile ? (
          <button aria-label="Close navigation" onClick={onClose}>
            <X />
          </button>
        ) : (
          !isCollapsed &&
          onToggleCollapse && (
            <button
              type="button"
              onClick={onToggleCollapse}
              className="rounded-md border border-transparent p-1.5 text-slate-400 transition hover:border-ink/20 hover:bg-slate-100 hover:text-ink"
              title="Collapse sidebar"
              aria-label="Collapse sidebar"
            >
              <PanelLeftClose size={18} />
            </button>
          )
        )}
      </div>
      <nav aria-label="App navigation" className="grid gap-2">
        {links.map(({ to, label, icon: Icon, end, count }) => {
          const isChatspace = count === 'chatspace'
          const badgeValue = isChatspace ? chatUnread : counts[count]
          const hasUnreadPing = isChatspace && chatUnread > 0
          const hasTaggedPing = isChatspace && chatMentioned

          return (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={onClose}
              title={isCollapsed ? label : undefined}
              className={({ isActive }) =>
                `group relative flex items-center rounded-md font-extrabold transition ${
                  isCollapsed
                    ? 'justify-center p-2.5 text-xs'
                    : 'gap-3 px-3 py-3 text-sm'
                } ${
                  isActive ? 'bg-purple text-white' : 'hover:bg-peach text-ink'
                }`
              }
            >
              <div className="relative flex items-center justify-center">
                <Icon size={18} />
                {hasUnreadPing && (
                  <span
                    className="absolute -top-1 -right-1 flex h-2.5 w-2.5"
                    title="Unread messages"
                  >
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full border border-white bg-blue-500" />
                  </span>
                )}
                {hasTaggedPing && (
                  <span
                    className="absolute -bottom-1.5 -left-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-blue-600 text-[9px] font-black text-white ring-2 ring-white shadow-xs animate-bounce"
                    title="You were tagged in Chatspace"
                  >
                    @
                  </span>
                )}
                {isCollapsed && badgeValue > 0 && !hasUnreadPing && (
                  <span
                    className="absolute -top-1.5 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full border border-white bg-purple px-1 text-[9px] font-bold text-white shadow-xs"
                    title={`${badgeValue} unread`}
                  >
                    {badgeValue > 99 ? '99+' : badgeValue}
                  </span>
                )}
              </div>
              {!isCollapsed && (
                <>
                  <span className="min-w-0 truncate">{label}</span>
                  <div className="ml-auto flex items-center gap-1.5">
                    {hasTaggedPing && (
                      <span
                        className="flex items-center gap-0.5 rounded-full bg-blue-600 px-1.5 py-0.2 text-[10px] font-black text-white shadow-xs"
                        title="You were tagged in Chatspace"
                      >
                        <span>@</span>
                        {chatMentionCount > 1 && <span>{chatMentionCount}</span>}
                      </span>
                    )}
                    {badgeValue > 0 && (
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          isChatspace
                            ? 'bg-blue-500 text-white'
                            : isNaN(badgeValue)
                            ? ''
                            : 'bg-white/25'
                        }`}
                      >
                        {badgeValue}
                      </span>
                    )}
                  </div>
                </>
              )}
            </NavLink>
          )
        })}
      </nav>
      {isCollapsed && onToggleCollapse && (
        <div className="mt-auto flex justify-center border-t border-slate-100 pt-4">
          <button
            type="button"
            onClick={onToggleCollapse}
            className="rounded-md border border-slate-200 p-2 text-slate-500 transition hover:border-ink hover:bg-peach hover:text-ink"
            title="Expand sidebar"
            aria-label="Expand sidebar"
          >
            <PanelLeftOpen size={16} />
          </button>
        </div>
      )}
    </aside>
  )
}

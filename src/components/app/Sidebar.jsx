import React, { useEffect, useMemo, useState } from 'react'
import {
  BookOpenCheck,
  BrainCircuit,
  ClipboardList,
  CircleHelp,
  Database,
  FileText,
  FlaskConical,
  GitBranch,
  LayoutDashboard,
  MessageSquare,
  MessageSquareWarning,
  PackageSearch,
  PanelLeftClose,
  PanelLeftOpen,
  Plug,
  SlidersHorizontal,
  UserCog,
  Building2,
  X,
} from 'lucide-react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import BrandSwitcher from './BrandSwitcher'
import Tooltip from '../ui/Tooltip'
import { useAuth } from '../../context/AuthContext'
import { useBrand } from '../../context/BrandContext'
import { getChatspaceUnreadStatus, wsClient } from '../../services/clientChat'

// Mirrors CLIENT_WORKSPACE_PATHS in app/ClientWorkspaceRoute.jsx, plus the feedback page.
const CLIENT_PATHS = new Set(['/app', '/app/client-chat', '/app/chat', '/app/flows', '/app/templates', '/app/products', '/app/feedback'])

const tabIs = (...values) => (path, params, expected) => path === expected && values.includes(params.get('tab') || '')

// Information architecture: grouped around what a brand team is trying to do.
// Every destination below already existed as a route; nothing is duplicated.
const SECTIONS = [
  {
    label: 'Workspace',
    items: [{ to: '/app', label: 'Overview', icon: LayoutDashboard, end: true }],
  },
  {
    label: 'Knowledge',
    items: [
      { to: '/app/brain?tab=faqs', label: 'FAQs', icon: CircleHelp, match: (p, q) => tabIs('faqs')(p, q, '/app/brain') },
      { to: '/app/brain?tab=sops', label: 'SOPs', icon: BookOpenCheck, match: (p, q) => tabIs('sops')(p, q, '/app/brain') },
      { to: '/app/workspace?tab=source', label: 'Knowledge sources', icon: Database, match: (p, q) => tabIs('source')(p, q, '/app/workspace') },
    ],
  },
  {
    label: 'Agent configuration',
    items: [
      { to: '/app/workspace', label: 'AI configuration', icon: SlidersHorizontal, match: (p, q) => p === '/app/workspace' && q.get('tab') !== 'source' },
      { to: '/app/brain', label: "AI's Brain", icon: BrainCircuit, match: (p, q) => p === '/app/brain' && !['faqs', 'sops'].includes(q.get('tab') || '') },
      { to: '/app/flows', label: 'Flows', icon: GitBranch },
      { to: '/app/templates', label: 'Templates', icon: FileText },
    ],
  },
  {
    label: 'Agent experience',
    items: [
      { to: '/app/chat', label: 'Chat with AI', icon: FlaskConical, agentLabel: true },
      { to: '/app/client-chat', label: 'Chatspace', icon: MessageSquare, unread: true },
      { to: '/app/feedback', label: 'Feedback & issues', icon: MessageSquareWarning },
    ],
  },
  {
    label: 'Business',
    items: [
      { to: '/app/products', label: 'Products', icon: PackageSearch },
      { to: '/app/operations', label: 'Operations', icon: ClipboardList },
    ],
  },
  {
    label: 'Integrations',
    items: [{ to: '/app/tools', label: 'Connected tools', icon: Plug }],
  },
  {
    label: 'Settings',
    items: [
      { to: '/app/settings?tab=team', label: 'Workspace settings', icon: Building2, match: (p, q) => tabIs('team', 'billing')(p, q, '/app/settings') },
      { to: '/app/settings?tab=profile', label: 'Account settings', icon: UserCog, match: (p, q) => p === '/app/settings' && !['team', 'billing'].includes(q.get('tab') || '') },
    ],
  },
]

function NavItem({ item, collapsed, active, unread, mentioned, mentionCount, onNavigate }) {
  const Icon = item.icon
  const content = (
    <Link
      to={item.to}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      aria-label={collapsed ? item.label : undefined}
      className={`group relative flex w-full items-center text-sm font-medium transition-colors duration-150 ${collapsed ? 'h-10 justify-center' : 'h-10 gap-3 px-3'} overflow-hidden rounded-xl ${
        active ? 'bg-gradient-to-br from-[#7A70FF] to-[#4F46E5] text-white shadow-[0_10px_20px_-10px_rgba(79,70,229,0.9)]' : 'text-ink/60 hover:bg-white/80 hover:text-primary hover:shadow-sm'
      }`}
    >
      <span className="relative grid shrink-0 place-items-center">
        <Icon size={18} strokeWidth={active ? 2 : 1.75} aria-hidden="true" />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full border border-white bg-primary" aria-hidden="true" />
        )}
      </span>
      <span aria-hidden={collapsed || undefined} className={`min-w-0 truncate whitespace-nowrap transition-[opacity,max-width] duration-200 ${collapsed ? 'max-w-0 flex-none opacity-0' : 'max-w-[11rem] flex-1 opacity-100'}`}>{item.label}</span>
      {!collapsed && (
        <>
          {mentioned && (
            <span className="rounded-full bg-orange px-1.5 text-[10px] font-semibold leading-4 text-white" title="You were tagged in Chatspace">
              @{mentionCount > 1 ? mentionCount : ''}
            </span>
          )}
          {unread > 0 && <span className="rounded-full bg-primary px-1.5 text-[10px] font-semibold leading-4 text-white">{unread > 99 ? '99+' : unread}</span>}
        </>
      )}
    </Link>
  )
  return collapsed ? <Tooltip className="flex w-full" label={unread > 0 ? `${item.label} · ${unread} unread` : item.label}>{content}</Tooltip> : content
}

export default function Sidebar({ mobile = false, onClose, collapsed = false, onToggleCollapse }) {
  const { user } = useAuth() || {}
  const isClient = user?.role === 'client'
  const { brandName, agentName } = useBrand()
  const location = useLocation()
  const [chat, setChat] = useState({ unread: 0, mentioned: false, mentions: 0 })
  const isCollapsed = collapsed && !mobile

  useEffect(() => {
    if (brandName) wsClient.connect(brandName)
    const update = () => {
      const status = getChatspaceUnreadStatus(brandName, user)
      setChat({ unread: status.unreadCount, mentioned: status.hasMention, mentions: status.mentionCount })
    }
    update()
    window.addEventListener('orb:client-chat-updated', update)
    window.addEventListener('orb:chatspace-unread-changed', update)
    return () => {
      window.removeEventListener('orb:client-chat-updated', update)
      window.removeEventListener('orb:chatspace-unread-changed', update)
    }
  }, [user, brandName])

  // Brand members only get the pages meant for their workspace (see ClientWorkspaceRoute);
  // staff roles see everything. Feedback is open to both.
  const sections = useMemo(
    () => (isClient ? SECTIONS.map((section) => ({ ...section, items: section.items.filter((item) => CLIENT_PATHS.has(item.to.split('?')[0])) })).filter((section) => section.items.length) : SECTIONS),
    [isClient],
  )
  const params = useMemo(() => new URLSearchParams(location.search), [location.search])
  const isActive = (item) => {
    if (item.match) return item.match(location.pathname, params)
    const [path] = item.to.split('?')
    return item.end ? location.pathname === path : location.pathname === path || location.pathname.startsWith(`${path}/`)
  }

  return (
    <aside className={`flex h-full w-full flex-col overflow-hidden transition-[padding] duration-200 ${mobile ? 'bg-white/90' : 'glass-pane border-r'} ${isCollapsed ? 'px-2.5' : 'px-3'}`}>
      <div className={`flex shrink-0 items-center ${isCollapsed ? 'h-12' : 'h-14'} ${isCollapsed ? 'justify-center' : 'justify-between px-1'}`}>
        <NavLink to="/app" className="orb-wordmark text-xl font-extrabold tracking-tight text-ink" aria-label="Orb home">
          {isCollapsed ? <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/80 text-lg shadow-sm">O<span className="text-primary">.</span></span> : <>Orb<span className="text-primary">.</span></>}
        </NavLink>
        {mobile ? (
          <button type="button" aria-label="Close navigation" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-fg-muted hover:bg-subtle hover:text-ink">
            <X size={18} />
          </button>
        ) : (
          !isCollapsed &&
          onToggleCollapse && (
            <Tooltip label="Collapse sidebar" side="bottom">
              <button type="button" onClick={onToggleCollapse} aria-label="Collapse sidebar" className="grid h-8 w-8 place-items-center rounded-lg text-fg-muted transition-colors hover:bg-subtle hover:text-ink">
                <PanelLeftClose size={17} />
              </button>
            </Tooltip>
          )
        )}
      </div>

      <div className={`shrink-0 ${isCollapsed ? 'flex justify-center pb-2' : 'pb-3 pt-1'}`}>
        <BrandSwitcher collapsed={isCollapsed} />
      </div>

      <nav aria-label="App navigation" className={`-mx-1 min-h-0 flex-1 overflow-y-auto px-1 pb-4 ${isCollapsed ? 'no-scrollbar' : 'thin-scroll'}`}>
        {sections.map((section, index) => (
          <div key={section.label} className={index === 0 ? '' : isCollapsed ? 'mt-2' : 'mt-5'}>
            {!isCollapsed && <p className="mb-1 animate-fade-in px-2.5 text-[11px] font-medium uppercase tracking-wide text-fg-muted/80">{section.label}</p>}
            <div className={`grid ${isCollapsed ? 'gap-0.5 rounded-2xl border border-white/80 bg-white/50 p-1 shadow-[0_1px_2px_rgba(120,70,20,0.06)]' : 'gap-0.5'}`}>
              {section.items.map((item) => (
                <NavItem
                  key={item.to}
                  item={item.agentLabel ? { ...item, label: `Chat with ${agentName}` } : item}
                  collapsed={isCollapsed}
                  active={isActive(item)}
                  unread={item.unread ? chat.unread : 0}
                  mentioned={item.unread && chat.mentioned}
                  mentionCount={chat.mentions}
                  onNavigate={onClose}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {isCollapsed && onToggleCollapse && (
        <div className="flex shrink-0 justify-center py-3">
          <Tooltip label="Expand sidebar">
            <button type="button" onClick={onToggleCollapse} aria-label="Expand sidebar" className="grid h-10 w-10 place-items-center rounded-xl border border-white/80 bg-white/50 text-ink/60 shadow-sm transition-colors hover:bg-white hover:text-primary">
              <PanelLeftOpen size={17} />
            </button>
          </Tooltip>
        </div>
      )}
    </aside>
  )
}

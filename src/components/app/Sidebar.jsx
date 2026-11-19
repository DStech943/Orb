import React, { useEffect, useMemo, useState } from 'react'
import {
  BarChart3,
  BrainCircuit,
  ClipboardList,
  FileText,
  FlaskConical,
  GitBranch,
  LayoutDashboard,
  Lightbulb,
  MessageSquare,
  MessageSquareWarning,
  PackageSearch,
  PanelLeftClose,
  PanelLeftOpen,
  Plug,
  Settings as SettingsIcon,
  SlidersHorizontal,
  X,
} from 'lucide-react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import BrandSwitcher from './BrandSwitcher'
import Tooltip from '../ui/Tooltip'
import { useAuth } from '../../context/AuthContext'
import { useBrand } from '../../context/BrandContext'
import { getChatspaceUnreadStatus, wsClient } from '../../services/clientChat'

// One entry per PAGE. Pages that have their own tab bar (AI Performance, Business Insights,
// AI's Brain, AI configuration, Settings) are listed once; the tabs live on the page itself.
// `also` lists other routes that belong to the same entry so it stays highlighted there.
const onPath = (...prefixes) => (path) => prefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))

const OVERVIEW = { to: '/app', label: 'Overview', icon: LayoutDashboard, end: true }
const AI_PERFORMANCE = { to: '/app/performance', label: 'AI Performance', icon: BarChart3 }
const CONVERSATIONS = { to: '/app/conversations', label: 'Conversations', icon: MessageSquare }
// Business Insights, Sales & Revenue and Product Insights are tabs of one page.
const BUSINESS_INSIGHTS = { to: '/app/insights', label: 'Business Insights', icon: Lightbulb, match: onPath('/app/insights', '/app/sales', '/app/product-insights') }
const CHAT = { to: '/app/chat', label: 'Chat with AI', icon: FlaskConical, agentLabel: true }
const CHATSPACE = { to: '/app/client-chat', label: 'Chatspace', icon: MessageSquare, unread: true }
// Feedback and issue reports are one list; a single report is a page inside it.
const FEEDBACK = { to: '/app/feedback', label: 'Feedback & issues', icon: MessageSquareWarning, match: onPath('/app/feedback', '/app/reports') }

// Brand members (client portal)
const CLIENT_SECTIONS = [
  { label: 'Workspace', items: [OVERVIEW] },
  { label: 'Insights', items: [AI_PERFORMANCE, CONVERSATIONS, BUSINESS_INSIGHTS] },
  { label: 'Agent', items: [CHAT, CHATSPACE, FEEDBACK] },
  { label: 'Connections', items: [{ to: '/app/tools', label: 'Integrations', icon: Plug }] },
]

// Laani brand members: strictly limited client portal
// Exposes ONLY: Workspace (Overview) and AI (Chat with Tanya, Chatspace).
// Insights, Integrations and Feedback are completely hidden.
const LAANI_CLIENT_SECTIONS = [
  { label: 'Workspace', items: [OVERVIEW] },
  { label: 'AI', items: [CHAT, CHATSPACE] },
]

// Datastraw staff (operations)
const ADMIN_SECTIONS = [
  { label: 'Workspace', items: [OVERVIEW] },
  { label: 'Insights', items: [AI_PERFORMANCE, CONVERSATIONS, BUSINESS_INSIGHTS] },
  {
    label: 'Knowledge & AI',
    items: [
      // FAQs and SOPs are tabs inside AI's Brain; knowledge sources and voice are tabs inside AI configuration.
      { to: '/app/brain', label: "AI's Brain", icon: BrainCircuit },
      { to: '/app/workspace', label: 'AI configuration', icon: SlidersHorizontal },
      { to: '/app/flows', label: 'Flows', icon: GitBranch },
      { to: '/app/templates', label: 'Templates', icon: FileText },
    ],
  },
  { label: 'Agent', items: [CHAT, CHATSPACE, FEEDBACK] },
  {
    label: 'Business',
    items: [
      { to: '/app/products', label: 'Products', icon: PackageSearch },
      { to: '/app/operations', label: 'Operations', icon: ClipboardList },
    ],
  },
  {
    label: 'Setup',
    items: [
      { to: '/app/tools', label: 'Integrations', icon: Plug },
      // Profile, team, notifications and billing are tabs inside Settings.
      { to: '/app/settings', label: 'Settings', icon: SettingsIcon },
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
  const { brandName, agentName, isLaani } = useBrand()
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

  // Brand members get the dedicated Client Portal IA (AI Performance, Conversations, BI);
  // staff roles see the full Operations & Knowledge portal. Laani client has a minimal IA.
  const sections = useMemo(() => {
    if (!isClient) return ADMIN_SECTIONS
    if (isLaani) return LAANI_CLIENT_SECTIONS
    return CLIENT_SECTIONS
  }, [isClient, isLaani])
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

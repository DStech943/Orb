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
import { LayoutGroup, motion } from 'motion/react'
import Orb from '../Orb'
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
      className={`group relative flex h-10 w-full items-center gap-3 overflow-hidden rounded-xl pl-4 pr-3 text-sm font-medium transition-colors duration-150 ${
        active ? 'text-ink [&_svg]:text-primary' : 'text-ink/65 hover:bg-white/45 hover:text-ink'
      }`}
    >
      {/* macOS sidebar selection: one white glass pill that slides to the active row. */}
      {active && <motion.span layoutId="sidebar-selection" aria-hidden="true" className="mac-selected absolute inset-0 rounded-xl" transition={{ type: 'spring', stiffness: 520, damping: 40, mass: 0.6 }} />}
      <span className="relative grid shrink-0 place-items-center">
        <Icon size={18} strokeWidth={active ? 2 : 1.75} aria-hidden="true" />
        {unread > 0 && <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full border border-white bg-primary" aria-hidden="true" />}
      </span>
      <span aria-hidden={collapsed || undefined} className={`mac-fade relative min-w-0 flex-1 truncate whitespace-nowrap ${collapsed ? 'opacity-0' : 'opacity-100'}`}>{item.label}</span>
      <span aria-hidden={collapsed || undefined} className={`mac-fade relative flex shrink-0 items-center gap-1 ${collapsed ? 'opacity-0' : 'opacity-100'}`}>
        {mentioned && (
          <span className="rounded-full bg-orange px-1.5 text-[10px] font-semibold leading-4 text-white" title="You were tagged in Chatspace">
            @{mentionCount > 1 ? mentionCount : ''}
          </span>
        )}
        {unread > 0 && <span className="rounded-full bg-primary px-1.5 text-[10px] font-semibold leading-4 text-white">{unread > 99 ? '99+' : unread}</span>}
      </span>
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
    <aside className={`flex h-full w-full flex-col overflow-hidden px-2 ${mobile ? 'bg-white/90' : 'bg-transparent'}`}>
      <div className="flex h-14 shrink-0 items-center justify-between pl-[10px] pr-1">
        <NavLink to="/app" className="group flex min-w-0 items-center gap-2.5" aria-label="Orb home">
          {/* The same live Orb agent as the floating guide button. */}
          <span className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full shadow-[0_6px_16px_-6px_rgba(99,91,255,0.55)] transition-transform duration-500 [transition-timing-function:var(--mac-ease)] group-hover:scale-110">
            <Orb colors={['#9c43fe', '#4cc2e9', '#101499']} backgroundColor="#ffffff" size={1.12} glow={1} hoverIntensity={1} trail={1} rotateOnHover followCursor intro />
          </span>
          <span aria-hidden={isCollapsed || undefined} className={`mac-fade orb-wordmark whitespace-nowrap text-xl font-extrabold tracking-tight text-ink ${isCollapsed ? 'opacity-0' : 'opacity-100'}`}>Orb<span className="text-primary">.</span></span>
        </NavLink>
        {mobile && (
          <button type="button" aria-label="Close navigation" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-fg-muted hover:bg-subtle hover:text-ink">
            <X size={18} />
          </button>
        )}
      </div>

      <div className="shrink-0 pb-3 pt-1">
        <BrandSwitcher collapsed={isCollapsed} />
      </div>

      <LayoutGroup id={mobile ? 'sidebar-mobile' : 'sidebar-desktop'}>
        <nav aria-label="App navigation" className="mac-scroll -mx-1 min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-1 pb-4">
          {sections.map((section, index) => (
            <div key={section.label} className={index === 0 ? '' : 'mt-4'}>
              {/* Section titles keep their height when collapsed (a hairline takes their place),
                  so the icons below never shift vertically. */}
              <div className="relative mb-1 h-5 px-2.5">
                <p aria-hidden={isCollapsed || undefined} className={`mac-fade whitespace-nowrap text-[11px] font-medium uppercase leading-5 tracking-wide text-fg-muted/80 ${isCollapsed ? 'opacity-0' : 'opacity-100'}`}>{section.label}</p>
                <span aria-hidden="true" className={`mac-fade absolute left-3 top-1/2 h-px w-6 bg-ink/15 ${isCollapsed ? 'opacity-100' : 'opacity-0'}`} />
              </div>
              <div className="grid gap-0.5">
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
      </LayoutGroup>

      {!mobile && onToggleCollapse && (
        <div className="shrink-0 border-t border-ink/[0.06] py-2">
          <Tooltip label="Expand sidebar" disabled={!isCollapsed} className="flex w-full">
            <button type="button" onClick={onToggleCollapse} aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-expanded={!isCollapsed} className="flex h-10 w-full items-center gap-3 rounded-xl pl-4 pr-3 text-sm font-medium text-ink/60 transition-colors hover:bg-white/45 hover:text-ink">
              {isCollapsed ? <PanelLeftOpen size={18} strokeWidth={1.75} className="shrink-0" /> : <PanelLeftClose size={18} strokeWidth={1.75} className="shrink-0" />}
              <span aria-hidden={isCollapsed || undefined} className={`mac-fade whitespace-nowrap ${isCollapsed ? 'opacity-0' : 'opacity-100'}`}>Collapse</span>
            </button>
          </Tooltip>
        </div>
      )}
    </aside>
  )
}

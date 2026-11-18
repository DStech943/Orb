import React from 'react'
import { ChevronDown, Eye, LogOut, Menu, PanelLeftClose, PanelLeftOpen, UserRound, Users } from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import Avatar from '../ui/Avatar'
import Dropdown from '../ui/Dropdown'
import ShareFeedback from './ShareFeedback'
import { useAuth } from '../../context/AuthContext'
import { useBrand } from '../../context/BrandContext'

const titles = {
  '/app': 'Overview',
  '/app/performance': 'AI Performance',
  '/app/performance/messages': 'Message Analytics',
  '/app/performance/satisfaction': 'Customer Satisfaction',
  '/app/conversations': 'Conversations',
  '/app/insights': 'Business Insights',
  '/app/sales': 'Sales & Revenue',
  '/app/product-insights': 'Product Insights',
  '/app/workspace': 'AI configuration',
  '/app/client-chat': 'Chatspace',
  '/app/chat': 'Test Assistant',
  '/app/feedback': 'Feedback & issues',
  '/app/operations': 'Operations',
  '/app/brain': "AI's Brain",
  '/app/sops': "AI's Brain",
  '/app/flows': 'Flows',
  '/app/faqs': "AI's Brain",
  '/app/templates': 'Templates',
  '/app/products': 'Products',
  '/app/tools': 'Connected tools',
  '/app/settings': 'Settings',
}

const brainTabTitles = { faqs: 'FAQs', sops: 'SOPs' }

export default function Topbar({ onMenu, collapsed = false, onToggleCollapse }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, logout, isAdmin, switchRole, canSwitchRole, isPreviewingClient, realRole } = useAuth()
  const { brandName, agentName } = useBrand()

  let title = titles[location.pathname] || 'Orb'
  if (location.pathname === '/app/chat') title = `Chat with ${agentName}`
  if (location.pathname.startsWith('/app/reports/')) title = 'Issue report'
  if (location.pathname === '/app/brain') {
    const tab = new URLSearchParams(location.search).get('tab')
    if (brainTabTitles[tab]) title = brainTabTitles[tab]
  }

  const signOut = async () => {
    await logout()
    navigate('/login')
  }

  const itemClass = 'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-ink transition-colors hover:bg-subtle'

  return (
    <header className="glass-bar sticky top-0 z-20 border-b px-4 sm:px-6">
      <div className="flex h-14 items-center gap-3">
        <button type="button" className="grid h-9 w-9 place-items-center rounded-lg text-fg-muted hover:bg-subtle hover:text-ink lg:hidden" aria-label="Open navigation" onClick={onMenu}>
          <Menu size={20} />
        </button>
        {onToggleCollapse && (
          <button
            type="button"
            className="hidden h-9 w-9 place-items-center rounded-lg text-fg-muted transition-colors hover:bg-subtle hover:text-ink lg:grid"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            onClick={onToggleCollapse}
          >
            {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
        )}
        <nav aria-label="Breadcrumb" className="mr-auto flex min-w-0 items-center gap-2 text-sm">
          {brandName && <span className="max-w-[6rem] truncate text-fg-muted sm:max-w-[10rem]">{brandName}</span>}
          {brandName && <span aria-hidden="true" className="text-line-strong">/</span>}
          <h1 className="truncate text-sm font-semibold text-ink">{title}</h1>
        </nav>
        {isPreviewingClient && (
          <button
            type="button"
            onClick={() => switchRole(null)}
            className="hidden items-center gap-1.5 rounded-full border border-primary/30 bg-primary-tint px-3 py-1 text-xs font-semibold text-primary transition-colors hover:bg-white sm:inline-flex"
            title="You are seeing Orb as a client would. Click to go back."
          >
            Previewing client view · Exit
          </button>
        )}
        <ShareFeedback />
        <Dropdown
          trigger={({ open, toggle }) => (
            <button type="button" className="flex items-center gap-1.5 rounded-full p-0.5 pr-1.5 transition-colors hover:bg-subtle" aria-haspopup="menu" aria-expanded={open} aria-label="Account menu" onClick={toggle}>
              <Avatar name={user?.name} src={user?.avatar} sources={user?.avatarSources} className="h-8 w-8" />
              <ChevronDown size={14} className="text-fg-muted" />
            </button>
          )}
        >
          <div className="border-b border-line px-2.5 pb-2 pt-1.5">
            <p className="truncate text-sm font-medium">{user?.name || user?.email || 'Your account'}</p>
            <div className="mt-0.5 flex items-center justify-between">
              <span className="text-xs capitalize text-fg-muted">Role: {user?.role || 'client'}{isPreviewingClient ? ' (preview)' : ''}</span>
              {/* Only staff can preview the client view; a client is never offered the staff one. */}
              {canSwitchRole && (
                <button
                  type="button"
                  onClick={() => switchRole(isPreviewingClient ? null : 'client')}
                  className="text-[11px] font-bold text-primary hover:underline"
                >
                  {isPreviewingClient ? `Back to ${realRole === 'admin' ? 'admin' : 'staff'} view` : 'Preview as client'}
                </button>
              )}
            </div>
          </div>
          <div className="pt-1">
            {isAdmin && (
              <Link role="menuitem" to="/app/settings?tab=profile" className={itemClass}>
                <UserRound size={15} className="text-fg-muted" /> Profile
              </Link>
            )}
            {user?.role === 'admin' && (
              <Link role="menuitem" to="/app/settings?tab=team" className={itemClass}>
                <Users size={15} className="text-fg-muted" /> Manage roles
              </Link>
            )}
            <button role="menuitem" type="button" className={itemClass} onClick={signOut}>
              <LogOut size={15} className="text-fg-muted" /> Log out
            </button>
          </div>
        </Dropdown>
      </div>
    </header>
  )
}

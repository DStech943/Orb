import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  CheckCircle2,
  FlaskConical,
  MessageSquare,
  MessageSquareWarning,
  PackageX,
  ShoppingBag,
  TrendingUp,
  UserCheck,
  Users,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useBrand } from '../../context/BrandContext'
import useBrandAnalytics from '../../hooks/useBrandAnalytics'
import useSupportKpis from '../../hooks/useSupportKpis'
import { getBusinessIntelligence } from '../../services/businessIntelligence'
import { listBrandConversations } from '../../services/conversations'
import { loadFeedback } from '../../lib/feedbackData'
import { StatCard, num, percent } from '../analytics/parts'
import Button from '../ui/Button'
import Skeleton from '../ui/Skeleton'
import LaaniOverview from './LaaniOverview'

const CHANNELS = { zoko: 'WhatsApp', instagram: 'Instagram', facebook: 'Facebook' }

function StandardClientOverview({ overview = {} }) {
  const { user, isAdmin } = useAuth()
  const { brand, brandId, brandName, agentName } = useBrand()
  const usable = Boolean(brandId) && !brand?.isPlaceholder
  const effectiveBrandName = brandName || overview?.brand?.name || ''
  const effectiveAgentName = agentName || brand?.ai_agent_name || (effectiveBrandName ? `${effectiveBrandName} AI` : 'AI')
  const firstName = overview.user?.firstName || user?.name?.split(' ')[0] || 'there'

  const analytics = useBrandAnalytics('30d')
  const support = useSupportKpis('30d')
  // 'loading' and 'error' are not "not connected": only a finished check can say that.
  const [store, setStore] = useState({ status: 'loading', data: null })
  const commerce = store.data
  const [recent, setRecent] = useState({ status: 'loading', items: [] })
  const [feedbackItems, setFeedbackItems] = useState([])

  const loadSideData = useCallback(() => {
    if (!usable) return
    setStore({ status: 'loading', data: null })
    getBusinessIntelligence(brandId, brandName)
      .then((data) => setStore({ status: 'ready', data }))
      .catch(() => setStore({ status: 'error', data: null }))
    loadFeedback(brandId, isAdmin).then((result) => setFeedbackItems(result?.items || [])).catch(() => setFeedbackItems([]))
    setRecent({ status: 'loading', items: [] })
    listBrandConversations(brandId, { range: '30d', limit: 4 })
      .then((result) => setRecent({ status: 'ready', items: result.items || [] }))
      .catch(() => setRecent({ status: 'error', items: [] }))
  }, [usable, brandId, brandName, isAdmin])

  useEffect(() => {
    loadSideData()
  }, [loadSideData])

  const data = analytics.data
  const s = data?.summary
  const c = data?.comparison
  const loading = analytics.status === 'loading' && !data

  // Only things that are really true right now. Nothing is shown just to fill the list.
  const attentionItems = useMemo(() => {
    const items = []
    const open = feedbackItems.filter((item) => item.status === 'open')
    if (open.length > 0) {
      items.push({ id: 'open-fb', title: `${open.length} feedback ${open.length === 1 ? 'item needs' : 'items need'} review`, description: 'Review feedback on your assistant’s replies.', to: '/app/feedback', cta: 'Review feedback' })
    }
    if (commerce?.outOfStock?.length > 0) {
      items.push({ id: 'oos', title: `${commerce.outOfStock.length} ${commerce.outOfStock.length === 1 ? 'product is' : 'products are'} out of stock`, description: 'Customers cannot order these until they are back in stock.', to: '/app/product-insights', cta: 'View products' })
    }
    if (s?.escalated_conversations > 0) {
      items.push({ id: 'handoffs', title: `${s.escalated_conversations} ${s.escalated_conversations === 1 ? 'conversation was' : 'conversations were'} handed to your team`, description: 'Last 30 days. Review them for questions the AI should be able to answer.', to: '/app/conversations', cta: 'View conversations' })
    }
    return items
  }, [feedbackItems, commerce, s])

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-2xl border border-white/80 bg-gradient-to-br from-[#FFEBDA] via-[#FFDDC2] to-[#FFD0AE] p-6 text-ink shadow-[0_12px_30px_-16px_rgba(200,110,40,0.4)]">
        <div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-24 h-64 w-64 rounded-full bg-white/45" />
        <div className="relative max-w-3xl">
          <div className="flex items-center gap-3.5">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white text-lg font-bold text-primary shadow-sm">
              {(effectiveAgentName || 'AI').slice(0, 1).toUpperCase()}
            </span>
            <div>
              <h2 className="font-display text-2xl font-medium tracking-tight text-ink">{effectiveAgentName}</h2>
              <p className="text-xs text-ink/75">
                AI assistant for <strong className="font-semibold text-ink">{effectiveBrandName || 'your brand'}</strong> · Welcome back, <em className="font-display not-italic italic font-medium">{firstName}</em>
              </p>
            </div>
          </div>
          <p className="mt-4 text-sm leading-relaxed text-ink/85">
            See how customers are using your assistant, which questions they ask, and where your team stepped in. Everything here comes from your real conversations.
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Link to="/app/chat"><Button variant="primary" size="md"><FlaskConical size={15} /> Test your assistant</Button></Link>
            <Link to="/app/performance"><Button variant="secondary" size="md"><TrendingUp size={15} /> View AI performance</Button></Link>
            <Link to="/app/feedback"><Button variant="ghost" size="md"><MessageSquareWarning size={15} /> Review feedback</Button></Link>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-display text-lg font-medium text-ink">Conversation <em>Summary</em></h3>
            <p className="text-xs text-fg-muted">Your last 30 days of customer conversations</p>
          </div>
          <Link to="/app/performance" className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline">Detailed analytics <ArrowRight size={13} /></Link>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-32" />)}</div>
        ) : analytics.status === 'error' ? (
          <div className="rounded-card border border-line bg-surface p-5 shadow-card" role="alert">
            <p className="text-sm font-semibold text-ink">Conversation numbers could not be loaded</p>
            <p className="mt-0.5 text-xs text-fg-muted">{analytics.error}</p>
            <Button className="mt-3" variant="secondary" size="sm" onClick={analytics.reload}>Try again</Button>
          </div>
        ) : s ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard title="Conversations" icon={Users} value={num(s.conversations_started)} change={c.conversations_started.change_pct} sub={`${num(s.active_conversations)} had customer messages`} />
            <StatCard title="Customer Messages" icon={MessageSquare} value={num(s.customer_messages)} change={c.customer_messages.change_pct} sub={s.reply_split_available ? `${num(s.replies_sent)} sent: ${num(s.replies.ai)} by AI, ${num(s.replies.team)} by human agents` : `${num(s.replies_sent)} messages sent to customers`} />
            <StatCard title="Chats Resolved" icon={CheckCircle2} tone="bg-emerald-50 text-success" value={support.data ? num(support.data.summary.resolved_chats) : '—'} change={support.data ? support.data.comparison.resolved_chats.change_pct : undefined} sub={support.data ? (support.data.summary.resolved_share != null ? `${percent(support.data.summary.resolved_share)} of handled chats` : 'No handled chats') : support.status === 'error' ? 'Could not be loaded' : 'Loading…'} />
            <StatCard title="Handed to Team" icon={UserCheck} tone="bg-sky-50 text-sky-600" value={num(s.escalated_conversations)} sub={s.escalation_rate != null ? `${s.escalation_rate}% of active conversations` : 'No active conversations'} />
          </div>
        ) : null}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-display text-lg font-medium text-ink">Products & <em>Catalog</em></h3>
            <p className="text-xs text-fg-muted">Your synced catalog and what customers mention</p>
          </div>
          <Link to="/app/product-insights" className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline">Product insights <ArrowRight size={13} /></Link>
        </div>
        {store.status === 'loading' ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-28" />)}</div>
        ) : store.status === 'error' ? (
          <div className="rounded-card border border-line bg-surface p-5 shadow-card" role="alert">
            <p className="text-sm font-semibold text-ink">Your store connection could not be checked</p>
            <p className="mt-0.5 text-xs text-fg-muted">This is a temporary problem loading your catalog, not a sign that your store is disconnected.</p>
            <Button className="mt-3" variant="secondary" size="sm" onClick={loadSideData}>Try again</Button>
          </div>
        ) : commerce?.connected ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard title="Products Synced" value={num(commerce.catalogCount)} sub={commerce.storeDomain || 'From your connected store'} />
            <StatCard title="Out of Stock" icon={PackageX} tone="bg-red-50 text-danger" value={num(commerce.outOfStock.length)} sub="Currently unavailable" />
            <StatCard title="Products Customers Mention" value={data ? num(data.products.length) : '—'} sub={data?.products[0] ? `Most: ${data.products[0].title}` : 'In the last 30 days'} />
          </div>
        ) : (
          <div className="flex flex-col items-start justify-between gap-4 rounded-card border border-line bg-surface p-5 shadow-card sm:flex-row sm:items-center">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-subtle text-fg-muted"><ShoppingBag size={20} /></span>
              <div>
                <h4 className="text-sm font-bold text-ink">Connect your ecommerce store</h4>
                <p className="text-xs text-fg-muted">Link Shopify to sync your catalog and see stock status next to what customers ask about.</p>
              </div>
            </div>
            <Link to="/app/tools"><Button variant="secondary" size="sm">Connect Shopify</Button></Link>
          </div>
        )}
        <p className="text-[11px] text-fg-muted">Sales and revenue are not connected to Orb, so they are not shown.</p>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="space-y-4 rounded-card border border-line bg-surface p-5 shadow-card">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-base font-medium text-ink">Needs <em>Attention</em></h3>
            <span className="rounded-full bg-primary-tint px-2 py-0.5 text-xs font-semibold text-primary">{attentionItems.length} {attentionItems.length === 1 ? 'item' : 'items'}</span>
          </div>
          {attentionItems.length === 0 ? (
            <p className="py-6 text-center text-xs text-fg-muted">Nothing needs your attention right now.</p>
          ) : (
            <div className="space-y-3">
              {attentionItems.map((item) => (
                <div key={item.id} className="flex items-start justify-between gap-3 rounded-xl border border-line bg-subtle/50 p-3.5">
                  <div>
                    <h4 className="text-xs font-bold text-ink">{item.title}</h4>
                    <p className="mt-0.5 text-xs text-fg-muted">{item.description}</p>
                  </div>
                  <Link to={item.to} className="shrink-0"><Button variant="secondary" size="sm">{item.cta}</Button></Link>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4 rounded-card border border-line bg-surface p-5 shadow-card">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-base font-medium text-ink">Recent <em>Customer</em> Conversations</h3>
            <Link to="/app/conversations" className="text-xs font-semibold text-primary hover:underline">View all</Link>
          </div>
          {recent.status === 'loading' ? (
            <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10" />)}</div>
          ) : recent.status === 'error' ? (
            <p className="py-6 text-center text-xs text-fg-muted">Conversations could not be loaded.</p>
          ) : recent.items.length === 0 ? (
            <p className="py-6 text-center text-xs text-fg-muted">No customer conversations in the last 30 days.</p>
          ) : (
            <div className="divide-y divide-line">
              {recent.items.map((conv) => (
                <Link key={conv.id} to="/app/conversations" className="flex items-center justify-between py-2.5 transition-colors hover:text-primary">
                  <div className="min-w-0 flex-1 pr-3">
                    <p className="truncate text-xs font-semibold text-ink">{conv.customer_name} <span className="font-normal text-fg-muted">· {CHANNELS[String(conv.platform).toLowerCase()] || conv.platform}</span></p>
                    <p className="truncate text-[11px] text-fg-muted">{conv.summary || conv.preview || 'No message preview'}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${conv.status === 'resolved' ? 'bg-emerald-50 text-success' : 'bg-amber-50 text-amber-700'}`}>{conv.status === 'resolved' ? 'Resolved' : 'Open'}</span>
                    <span className="mt-0.5 block text-[10px] text-fg-muted">{new Date(conv.last_activity_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function ClientOverview({ overview = {} }) {
  const { isLaani } = useBrand()

  // For the Laani brand, render the simplified business landing page without conversation analytics.
  if (isLaani) {
    return <LaaniOverview overview={overview} />
  }

  // Other client brands retain their standard conversation & store overview.
  return <StandardClientOverview overview={overview} />
}

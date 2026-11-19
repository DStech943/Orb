import React, { useEffect, useState } from 'react'
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  ExternalLink,
  Filter,
  MessageSquare,
  RefreshCw,
  Search,
  Star,
  User,
  X,
  XCircle,
  AlertTriangle,
} from 'lucide-react'
import PageHeader from '../components/ui/PageHeader'
import Button from '../components/ui/Button'
import Drawer from '../components/ui/Drawer'
import { useBrand } from '../context/BrandContext'
import { useAuth } from '../context/AuthContext'
import { listBrandConversations } from '../services/conversations'
import { activeBrandId, activeBrandName } from '../services/orbApi'
import OrbLoader from '../components/ui/OrbLoader'
import ChatMessageText from '../components/chat/ChatMessageText'

const OUTCOME_FILTERS = [
  { id: 'all', label: 'All Outcomes' },
  { id: 'successful', label: 'Successful' },
  { id: 'escalated', label: 'Escalated' },
  { id: 'unsuccessful', label: 'Unsuccessful' },
]

export default function Conversations() {
  const { brand, brandName, agentName } = useBrand()
  const { isAdmin } = useAuth()

  const effectiveBrandId =
    brand?.id || activeBrandId() || '00000000-0000-0000-0000-000000000002'
  const effectiveBrandName =
    brandName || activeBrandName() || 'Nutrova'
  const effectiveAgentName =
    agentName || brand?.ai_agent_name || `${effectiveBrandName} AI`

  const [conversations, setConversations] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [outcomeFilter, setOutcomeFilter] = useState('all')
  const [selectedConv, setSelectedConv] = useState(null)

  const loadConversations = async () => {
    setLoading(true)
    try {
      const items = await listBrandConversations(effectiveBrandId, effectiveBrandName, {
        search,
        outcome: outcomeFilter,
        isAdmin,
      })
      setConversations(items || [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadConversations()
  }, [effectiveBrandId, effectiveBrandName, outcomeFilter, isAdmin])

  const handleSearchSubmit = (e) => {
    e.preventDefault()
    loadConversations()
  }

  const outcomeBadge = (outcome) => {
    switch (outcome) {
      case 'successful':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-success">
            <CheckCircle2 size={12} /> Resolved by AI
          </span>
        )
      case 'escalated':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
            <AlertTriangle size={12} /> Handed Off
          </span>
        )
      case 'unsuccessful':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-danger">
            <XCircle size={12} /> Issue Reported
          </span>
        )
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
            Completed
          </span>
        )
    }
  }

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        eyebrow="Customer Experience"
        title="Customer Conversations"
        description={`Browse customer interactions handled by ${agentName} across your active sales channels.`}
        actions={
          <Button variant="secondary" size="sm" onClick={loadConversations}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </Button>
        }
      />

      {/* Search and Filters Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-surface p-4 shadow-card">
        <form onSubmit={handleSearchSubmit} className="relative min-w-[280px] flex-1">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-fg-muted" />
          <input
            type="text"
            placeholder="Search conversations by keyword, customer, or ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-control border border-line-strong bg-white py-2 pl-9 pr-3 text-sm text-ink placeholder:text-fg-muted focus:border-primary focus:outline-none"
          />
        </form>

        <div className="flex flex-wrap items-center gap-1.5">
          {OUTCOME_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setOutcomeFilter(f.id)}
              className={`rounded-control px-3 py-1.5 text-xs font-semibold transition-colors ${outcomeFilter === f.id
                ? 'bg-primary text-white shadow-sm'
                : 'border border-line-strong bg-white text-fg-muted hover:bg-subtle hover:text-ink'
                }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Conversations List */}
      {loading && !conversations.length ? (
        <OrbLoader label="Loading conversations" />
      ) : conversations.length === 0 ? (
        <div className="rounded-card border border-line bg-surface p-12 text-center shadow-card">
          <MessageSquare size={36} className="mx-auto text-fg-muted/60" />
          <h3 className="mt-3 text-base font-bold text-ink">No conversations found</h3>
          <p className="mt-1 text-sm text-fg-muted">
            {search ? 'Try adjusting your search terms or filters.' : 'Conversations handled by your AI assistant will appear here.'}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
          <div className="divide-y divide-line">
            {conversations.map((conv) => (
              <div
                key={conv.id}
                onClick={() => setSelectedConv(conv)}
                className="group flex cursor-pointer flex-col gap-3 p-4 transition-colors hover:bg-subtle/60 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-bold text-primary">{conv.id}</span>
                    <span className="text-xs text-line-strong">•</span>
                    <span className="font-semibold text-ink">{conv.customerName}</span>
                    <span className="rounded-full bg-subtle px-2 py-0.5 text-[10px] font-medium text-fg-muted">
                      {conv.channel}
                    </span>
                    {conv.rating && (
                      <span className="flex items-center gap-0.5 text-xs font-bold text-amber-500">
                        <Star size={12} className="fill-amber-400 text-amber-400" />
                        {conv.rating}.0
                      </span>
                    )}
                  </div>
                  <p className="truncate text-sm text-fg-muted">{conv.summary}</p>
                </div>

                <div className="flex shrink-0 items-center justify-between gap-4 sm:justify-end">
                  <div className="text-right">
                    <div className="flex justify-end">{outcomeBadge(conv.outcome)}</div>
                    <span className="mt-1 block text-[11px] text-fg-muted">
                      {new Date(conv.startedAt).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Conversation Detail Drawer */}
      <Drawer
        open={Boolean(selectedConv)}
        onClose={() => setSelectedConv(null)}
        title={selectedConv ? `${selectedConv.customerName} · ${selectedConv.id}` : 'Conversation'}
        width="max-w-xl"
      >
        {selectedConv && (
          <div className="flex h-full flex-col justify-between space-y-4">
            {/* Metadata Header */}
            <div className="rounded-xl border border-line bg-subtle/50 p-3.5 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-ink">Channel: <span className="font-normal text-fg-muted">{selectedConv.channel}</span></span>
                <div>{outcomeBadge(selectedConv.outcome)}</div>
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-fg-muted">
                <span>Date: {new Date(selectedConv.startedAt).toLocaleString()}</span>
                <span>Messages: {selectedConv.messageCount}</span>
              </div>
            </div>

            {detail.status === 'loading' && <p className="flex items-center gap-2 text-sm text-fg-muted" role="status"><Loader2 size={15} className="animate-spin" /> Loading messages…</p>}
            {detail.status === 'error' && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{detail.error}</p>}
            {detail.status === 'ready' && detail.messages.length === 0 && <p className="text-sm text-fg-muted">No messages were found for this conversation.</p>}
            {detail.status === 'ready' && detail.messages.length > 0 && (
              <>
                {detail.messages.length >= 300 && <p className="text-[11px] text-fg-muted">Showing the first 300 messages.</p>}
                <div className="flex-1 space-y-3.5 overflow-y-auto px-1 py-2">
                  {detail.messages.map((msg) => {
                    const customer = msg.sender === 'customer'
                    return (
                      <div key={msg.id} className={`flex flex-col ${customer ? 'items-start' : 'items-end'}`}>
                        <span className="mb-1 text-[11px] font-semibold text-fg-muted">
                          {customer ? selected.customer_name : (SENDER_META[msg.sender]?.label || 'Reply')}
                        </span>
                        <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm ${customer ? 'rounded-tl-sm border border-line-strong bg-white text-ink' : msg.sender === 'ai' ? 'rounded-tr-sm bg-primary text-white' : msg.sender === 'team' ? 'rounded-tr-sm border border-emerald-200 bg-emerald-50 text-ink' : msg.sender === 'automated' ? 'rounded-tr-sm border border-[#FF9B3D]/30 bg-[#FFFAF3] text-ink' : 'rounded-tr-sm border border-line-strong bg-subtle text-ink'}`}>
                          {msg.text ? <ChatMessageText text={msg.text} isUser={msg.sender === 'ai'} /> : <p className="italic opacity-80">{msg.media_type ? `[${msg.media_type}]` : '[no text]'}</p>}
                          {msg.media_url && <a href={msg.media_url} target="_blank" rel="noopener noreferrer" className="mt-1 block text-xs underline">Open attachment</a>}
                        </div>
                        <span className="mt-1 text-[10px] text-fg-muted">{when(msg.timestamp, false)}</span>
                      </div>
                    )
                  })}
                </div>
                <p className="text-[11px] text-fg-muted">Each reply is labelled by who sent it: the AI (confirmed by the AI agent), human agents on your team, an automated flow, or outside Orb (another app, or the API without an AI confirmation).</p>
              </>
            )}
          </div>
        )}
      </Drawer>
    </div>
  )
}

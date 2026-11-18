import React, { useCallback, useEffect, useRef, useState } from 'react'
import { CheckCircle2, ChevronLeft, ChevronRight, Clock, Loader2, MessageSquare, RefreshCw, Search } from 'lucide-react'
import PageHeader from '../components/ui/PageHeader'
import Button from '../components/ui/Button'
import Drawer from '../components/ui/Drawer'
import OrbLoader from '../components/ui/OrbLoader'
import { useBrand } from '../context/BrandContext'
import { DATE_RANGES } from '../services/aiAnalytics'
import { getConversationMessages, listBrandConversations } from '../services/conversations'

const STATUS_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'open', label: 'Open' },
  { id: 'resolved', label: 'Resolved' },
]
const PAGE_SIZE = 25
const CHANNELS = { zoko: 'WhatsApp', instagram: 'Instagram', facebook: 'Facebook' }
const channelName = (platform) => CHANNELS[String(platform).toLowerCase()] || String(platform || 'Unknown')

const when = (value, withDate = true) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return withDate
    ? date.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function StatusBadge({ status }) {
  return status === 'resolved' ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-success"><CheckCircle2 size={12} /> Resolved</span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700"><Clock size={12} /> Open</span>
  )
}

export default function Conversations() {
  const { brand, brandId, agentName, loading: brandsLoading } = useBrand()
  const usable = Boolean(brandId) && !brand?.isPlaceholder

  const [rangeId, setRangeId] = useState('30d')
  const [status, setStatus] = useState('all')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [state, setState] = useState({ status: 'loading', items: [], total: 0, error: '' })
  const [selected, setSelected] = useState(null)
  const [detail, setDetail] = useState({ status: 'idle', conversation: null, messages: [], error: '' })
  const ticket = useRef(0)

  const load = useCallback(async () => {
    if (!usable) {
      setState({ status: brandsLoading ? 'loading' : 'idle', items: [], total: 0, error: '' })
      return
    }
    const mine = ++ticket.current
    setState((current) => ({ ...current, status: 'loading', error: '' }))
    try {
      const result = await listBrandConversations(brandId, { range: rangeId, status, search, limit: PAGE_SIZE, offset: page * PAGE_SIZE })
      if (mine === ticket.current) setState({ status: 'ready', items: result.items || [], total: result.total || 0, error: '' })
    } catch (cause) {
      if (mine === ticket.current) setState({ status: 'error', items: [], total: 0, error: cause?.message || 'Could not load conversations.' })
    }
  }, [usable, brandsLoading, brandId, rangeId, status, search, page])

  useEffect(() => {
    load()
  }, [load])

  // Any change to what is being listed starts again from the first page.
  useEffect(() => {
    setPage(0)
  }, [brandId, rangeId, status, search])

  const openConversation = async (item) => {
    setSelected(item)
    setDetail({ status: 'loading', conversation: null, messages: [], error: '' })
    try {
      const result = await getConversationMessages(brandId, item.id)
      setDetail({ status: 'ready', conversation: result.conversation, messages: result.messages || [], error: '' })
    } catch (cause) {
      setDetail({ status: 'error', conversation: null, messages: [], error: cause?.message || 'Could not load this conversation.' })
    }
  }

  const submitSearch = (event) => {
    event.preventDefault()
    setSearch(searchInput.trim())
  }

  const first = state.total === 0 ? 0 : page * PAGE_SIZE + 1
  const last = Math.min(state.total, page * PAGE_SIZE + state.items.length)
  const hasNext = (page + 1) * PAGE_SIZE < state.total

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        eyebrow="Customer Experience"
        title="Customer Conversations"
        description={`Real conversations your customers have had with ${agentName} and your team.`}
        actions={
          <Button variant="secondary" size="sm" onClick={load}>
            <RefreshCw size={14} className={state.status === 'loading' ? 'animate-spin' : ''} />
            Refresh
          </Button>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-surface p-4 shadow-card">
        <form onSubmit={submitSearch} className="relative min-w-[260px] flex-1">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-fg-muted" />
          <input
            type="search"
            placeholder="Search the latest message or customer name…"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            aria-label="Search conversations"
            className="w-full rounded-control border border-line-strong bg-white py-2 pl-9 pr-3 text-sm text-ink placeholder:text-fg-muted focus:border-primary focus:outline-none"
          />
        </form>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1.5" role="group" aria-label="Status">
            {STATUS_FILTERS.map((f) => (
              <button key={f.id} type="button" onClick={() => setStatus(f.id)} aria-pressed={status === f.id}
                className={`rounded-control px-3 py-1.5 text-xs font-semibold transition-colors ${status === f.id ? 'bg-primary text-white shadow-sm' : 'border border-line-strong bg-white text-fg-muted hover:bg-subtle hover:text-ink'}`}>
                {f.label}
              </button>
            ))}
          </div>
          <select value={rangeId} onChange={(event) => setRangeId(event.target.value)} aria-label="Time range"
            className="rounded-control border border-line-strong bg-white px-2.5 py-1.5 text-xs font-semibold text-ink focus:border-primary focus:outline-none">
            {DATE_RANGES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
        </div>
      </div>

      {state.status === 'idle' ? (
        <div className="rounded-card border border-line bg-surface p-12 text-center shadow-card text-sm text-fg-muted">Pick a brand in the top bar to see its conversations.</div>
      ) : state.status === 'loading' && !state.items.length ? (
        <OrbLoader label="Loading conversations" />
      ) : state.status === 'error' ? (
        <div className="rounded-card border border-red-200 bg-red-50 p-6" role="alert">
          <h3 className="text-base font-bold text-ink">Conversations could not be loaded</h3>
          <p className="mt-1 text-sm text-fg-muted">{state.error}</p>
          <Button className="mt-3" variant="secondary" size="sm" onClick={load}><RefreshCw size={14} /> Try again</Button>
        </div>
      ) : state.items.length === 0 ? (
        <div className="rounded-card border border-line bg-surface p-12 text-center shadow-card">
          <MessageSquare size={36} className="mx-auto text-fg-muted/60" />
          <h3 className="mt-3 text-base font-bold text-ink">No conversations found</h3>
          <p className="mt-1 text-sm text-fg-muted">{search || status !== 'all' ? 'Try a different search, status or time range.' : 'No customer conversations were active in this period.'}</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
          <ul className="divide-y divide-line">
            {state.items.map((conv) => (
              <li key={conv.id}>
                <button type="button" onClick={() => openConversation(conv)} className="group flex w-full flex-col gap-3 p-4 text-left transition-colors hover:bg-subtle/60 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-ink">{conv.customer_name}</span>
                      {conv.contact && <span className="text-xs text-fg-muted">{conv.contact}</span>}
                      <span className="rounded-full bg-subtle px-2 py-0.5 text-[10px] font-medium text-fg-muted">{channelName(conv.platform)}</span>
                      {conv.topics.slice(0, 2).map((topic) => <span key={topic} className="rounded-full bg-primary-tint px-2 py-0.5 text-[10px] font-semibold text-primary">{topic}</span>)}
                    </div>
                    <p className="truncate text-sm text-fg-muted">{conv.summary || conv.preview || 'No message preview'}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <StatusBadge status={conv.status} />
                    <span className="mt-1 block text-[11px] text-fg-muted">Last activity {when(conv.last_activity_at)}</span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between border-t border-line bg-subtle/40 px-4 py-2.5 text-xs text-fg-muted">
            <span>{first}–{last} of {state.total.toLocaleString()}</span>
            <div className="flex items-center gap-1.5">
              <Button variant="secondary" size="sm" disabled={page === 0 || state.status === 'loading'} onClick={() => setPage((p) => Math.max(0, p - 1))}><ChevronLeft size={14} /> Previous</Button>
              <Button variant="secondary" size="sm" disabled={!hasNext || state.status === 'loading'} onClick={() => setPage((p) => p + 1)}>Next <ChevronRight size={14} /></Button>
            </div>
          </div>
        </div>
      )}

      <Drawer open={Boolean(selected)} onClose={() => setSelected(null)} title={selected ? `${selected.customer_name}${selected.contact ? ` · ${selected.contact}` : ''}` : 'Conversation'} width="max-w-xl">
        {selected && (
          <div className="flex h-full flex-col space-y-4">
            <div className="rounded-xl border border-line bg-subtle/50 p-3.5 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-ink">Channel: <span className="font-normal text-fg-muted">{channelName(selected.platform)}</span></span>
                <StatusBadge status={selected.status} />
              </div>
              <p className="mt-2 text-fg-muted">Started {when(selected.started_at)}{selected.resolved_at ? ` · Resolved ${when(selected.resolved_at)}` : ''}</p>
              {selected.summary && <p className="mt-2 text-fg-muted"><span className="font-semibold text-ink">Summary: </span>{selected.summary}</p>}
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
                          {customer ? selected.customer_name : msg.sent_from_dashboard ? 'Your team' : 'Reply'}
                        </span>
                        <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm ${customer ? 'rounded-tl-sm border border-line-strong bg-white text-ink' : msg.sent_from_dashboard ? 'rounded-tr-sm border border-[#FF9B3D]/30 bg-[#FFFAF3] text-ink' : 'rounded-tr-sm bg-primary text-white'}`}>
                          {msg.text ? <p className="whitespace-pre-wrap break-words">{msg.text}</p> : <p className="italic opacity-80">{msg.media_type ? `[${msg.media_type}]` : '[no text]'}</p>}
                          {msg.media_url && <a href={msg.media_url} target="_blank" rel="noopener noreferrer" className="mt-1 block text-xs underline">Open attachment</a>}
                        </div>
                        <span className="mt-1 text-[10px] text-fg-muted">{when(msg.timestamp, false)}</span>
                      </div>
                    )
                  })}
                </div>
                <p className="text-[11px] text-fg-muted">Replies from the AI and from your team are not labelled separately in the data. Messages sent from the dashboard are marked "Your team".</p>
              </>
            )}
          </div>
        )}
      </Drawer>
    </div>
  )
}

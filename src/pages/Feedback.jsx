import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowUpRight, Check, FlaskConical, MessageSquareWarning, ThumbsUp, Trash2 } from 'lucide-react'
import Button from '../components/ui/Button'
import EmptyState from '../components/ui/EmptyState'
import PageHeader from '../components/ui/PageHeader'
import Select from '../components/ui/Select'
import Skeleton from '../components/ui/Skeleton'
import StatusChip from '../components/ui/StatusChip'
import { issueCategoryLabel } from '../components/chat/ReportIssueModal'
import FeedbackConversation from '../components/chat/FeedbackConversation'
import { useAuth } from '../context/AuthContext'
import { useBrand } from '../context/BrandContext'
import { useToast } from '../context/ToastContext'
import { formatDateTime, pluralize, timeAgo } from '../lib/format'
import { loadFeedback } from '../lib/feedbackData'
import { deleteBrandAgentFeedback, hasOrbApi, updateBrandAgentFeedback } from '../services/orbApi'

// The status values are the backend contract (`AgentFeedbackStatusPatch`).
const STATUS_STEPS = [
  { id: 'open', label: 'Received', hint: 'The team has your feedback.' },
  { id: 'updated_in_knowledge', label: 'Knowledge updated', hint: 'The agent’s knowledge was improved.' },
  { id: 'retested', label: 'Retested', hint: 'The change was tested again.' },
  { id: 'resolved', label: 'Resolved', hint: 'This is done.' },
]
const GROUPS = [
  { id: 'open', label: 'Open', match: (item) => item.status === 'open' },
  { id: 'progress', label: 'In progress', match: (item) => ['updated_in_knowledge', 'retested'].includes(item.status) },
  { id: 'resolved', label: 'Resolved', match: (item) => item.status === 'resolved' },
]

const isPositive = (item) => item.kind !== 'issue_report' && (item.tags || []).includes('Good reply')
const itemTitle = (item) => {
  if (item.kind === 'issue_report') return issueCategoryLabel(item.category) || 'Reported issue'
  if (isPositive(item)) return 'Marked a reply as helpful'
  return item.scope === 'reply' ? 'Suggested a better reply' : 'Conversation feedback'
}
const itemSummary = (item) => item.note || item.ideal_reply || item.agent_reply || (item.tags || []).join(', ') || 'No additional details.'

export const submitterName = (item, currentUser, scope) => {
  if (item?.submitted_by_name && item.submitted_by_name !== 'Workspace member' && item.submitted_by_name !== 'Google Account') {
    return item.submitted_by_name
  }
  if (currentUser && item?.submitted_by === currentUser.id && currentUser.name) return currentUser.name
  if (item?.submitted_by_email) {
    const local = item.submitted_by_email.split('@')[0]
    return local.replace(/[._]/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
  }
  if (scope === 'sessions' && currentUser?.name) return currentUser.name
  if (currentUser && item?.submitted_by === currentUser.id && currentUser.email) {
    return currentUser.email.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
  }
  return item?.submitted_by_name || 'Team member'
}

export const submitterEmail = (item, currentUser, scope) => {
  if (item?.submitted_by_email) return item.submitted_by_email
  if (currentUser && item?.submitted_by === currentUser.id && currentUser.email) return currentUser.email
  if (scope === 'sessions' && currentUser?.email) return currentUser.email
  return ''
}

function StatusTrail({ status }) {
  const current = Math.max(0, STATUS_STEPS.findIndex((step) => step.id === status))
  return (
    <ol className="grid gap-3" aria-label="Progress">
      {STATUS_STEPS.map((step, index) => {
        const done = index <= current
        return (
          <li key={step.id} className="flex items-start gap-3">
            <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[10px] ${done ? 'border-primary bg-primary text-white' : 'border-line-strong bg-white text-transparent'}`}>
              <Check size={12} aria-hidden="true" />
            </span>
            <span>
              <span className={`block text-sm ${done ? 'font-medium text-ink' : 'text-fg-muted'}`}>{step.label}</span>
              {index === current && <span className="block text-xs text-fg-muted">{step.hint}</span>}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

function Detail({ item, currentUser, scope, isAdmin, brandId, agentName, onStatus, onDeleted }) {
  const { showToast } = useToast()
  const [saving, setSaving] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  useEffect(() => { setConfirmingDelete(false) }, [item.id])
  const remove = async () => {
    setDeleting(true)
    try {
      await deleteBrandAgentFeedback(brandId, item.id)
      onDeleted(item.id)
      showToast(item.kind === 'issue_report' ? 'Issue deleted.' : 'Feedback deleted.')
    } catch (failure) {
      showToast(failure?.message || 'Could not delete this item.', 'error')
      setDeleting(false)
    }
  }
  const name = submitterName(item, currentUser, scope)
  const email = submitterEmail(item, currentUser, scope)
  const change = async (status) => {
    setSaving(true)
    try {
      await updateBrandAgentFeedback(brandId, item.id, { status })
      onStatus(item.id, status)
      showToast('Status updated.')
    } catch (failure) {
      showToast(failure?.message || 'Could not update the status.', 'error')
    } finally {
      setSaving(false)
    }
  }
  return (
    <div className="grid gap-5 animate-fade-in">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs text-fg-muted">{item.kind === 'issue_report' ? 'Reported issue' : 'Feedback'} · {formatDateTime(item.created_at)}</p>
          <h3 className="mt-1 text-lg font-semibold tracking-tight">{itemTitle(item)}</h3>
        </div>
        <StatusChip status={item.status} />
      </div>

      {/* Submitter Info Card */}
      <div className="flex items-center gap-3 rounded-xl border border-line bg-canvas/70 p-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary-tint text-sm font-bold text-primary">
          {(name || email || 'U').charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold text-ink">{name}</p>
            <span className="rounded-full bg-subtle px-2 py-0.5 text-[10px] font-medium text-fg-muted">
              Submitted by
            </span>
          </div>
          {email ? (
            <p className="truncate text-xs text-fg-muted">{email}</p>
          ) : (
            <p className="text-xs text-fg-muted/70">Email not provided</p>
          )}
        </div>
      </div>
      {item.note && (
        <section>
          <h4 className="mb-1 text-xs font-medium text-fg-muted">What was said</h4>
          <p className="whitespace-pre-wrap text-sm leading-6">{item.note}</p>
        </section>
      )}
      {item.agent_reply && (
        <section>
          <h4 className="mb-1 text-xs font-medium text-fg-muted">The agent’s response</h4>
          <p className="whitespace-pre-wrap rounded-xl bg-canvas p-3 text-sm leading-6">{item.agent_reply}</p>
        </section>
      )}
      {item.ideal_reply && (
        <section>
          <h4 className="mb-1 text-xs font-medium text-fg-muted">What it should have said</h4>
          <p className="whitespace-pre-wrap rounded-xl bg-success-tint p-3 text-sm leading-6">{item.ideal_reply}</p>
        </section>
      )}
      {(item.tags || []).length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {item.tags.map((tag) => (
            <span key={tag} className="rounded-full bg-subtle px-2.5 py-0.5 text-xs text-fg-muted">{tag}</span>
          ))}
        </div>
      )}
      {(item.tagged_people || []).length > 0 && (
        <p className="text-xs text-fg-muted">Shared with {item.tagged_people.map((person) => person.name).filter(Boolean).join(', ')}</p>
      )}
      <FeedbackConversation item={item} brandId={brandId} agentName={agentName} />
      <section>
        <h4 className="mb-3 text-xs font-medium text-fg-muted">Where this stands</h4>
        <StatusTrail status={item.status} />
      </section>
      <div className="flex flex-wrap items-end gap-3 border-t border-line pt-4">
        {item.kind === 'issue_report' && (
          <Link to={`/app/reports/${brandId}/${item.id}`} className="inline-flex h-8 items-center gap-2 rounded-control border border-line-strong bg-white px-3 text-xs font-medium shadow-card transition-colors hover:border-primary/40 hover:bg-subtle">
            Open full report <ArrowUpRight size={14} />
          </Link>
        )}
        {isAdmin && (
          <Select label="Update status" value={item.status} onChange={(event) => change(event.target.value)} disabled={saving} className="w-52">
            {STATUS_STEPS.map((step) => <option key={step.id} value={step.id}>{step.label}</option>)}
          </Select>
        )}
        {isAdmin && (
          confirmingDelete ? (
            <div className="ml-auto flex flex-wrap items-center gap-2" role="alert">
              <span className="text-xs text-fg-muted">Delete this permanently?</span>
              <Button size="sm" variant="secondary" onClick={() => setConfirmingDelete(false)} disabled={deleting}>Cancel</Button>
              <button type="button" onClick={remove} disabled={deleting} className="inline-flex h-8 items-center gap-1.5 rounded-control bg-danger px-3 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60">
                <Trash2 size={13} /> {deleting ? 'Deleting…' : 'Yes, delete'}
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmingDelete(true)} className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-control border border-danger/30 bg-white px-3 text-xs font-medium text-danger transition-colors hover:bg-danger-tint">
              <Trash2 size={13} /> Delete
            </button>
          )
        )}
      </div>
    </div>
  )
}

export default function Feedback() {
  const { user, isAdmin } = useAuth()
  const { brandId, brandName, agentName, loading: brandLoading } = useBrand()
  const navigate = useNavigate()
  const [state, setState] = useState({ loading: true, items: [], scope: 'sessions', error: '' })
  const [group, setGroup] = useState('open')
  const [selectedId, setSelectedId] = useState('')

  const load = useCallback(async () => {
    if (!brandId) {
      setState({ loading: false, items: [], scope: 'sessions', error: '' })
      return
    }
    if (!hasOrbApi) {
      setState({ loading: false, items: [], scope: 'sessions', error: 'Start the Orb backend to load feedback.' })
      return
    }
    setState((current) => ({ ...current, loading: true, error: '' }))
    try {
      const result = await loadFeedback(brandId, isAdmin)
      setState({ loading: false, items: result.items, scope: result.scope, error: '' })
    } catch (failure) {
      setState({ loading: false, items: [], scope: 'sessions', error: failure?.message || 'We couldn’t load feedback right now.' })
    }
  }, [brandId, isAdmin])

  useEffect(() => { load() }, [load, user?.id])

  const visible = useMemo(() => state.items.filter(GROUPS.find((entry) => entry.id === group).match), [state.items, group])
  const selected = visible.find((item) => item.id === selectedId) || null
  const counts = useMemo(() => Object.fromEntries(GROUPS.map((entry) => [entry.id, state.items.filter(entry.match).length])), [state.items])
  const updateStatus = (id, status) => setState((current) => ({ ...current, items: current.items.map((item) => (item.id === id ? { ...item, status } : item)) }))

  const removeItem = (id) => { setSelectedId(''); setState((current) => ({ ...current, items: current.items.filter((item) => item.id !== id) })) }

  if (brandLoading) return <Skeleton className="h-64" />

  return (
    <div className="mx-auto w-full max-w-7xl">
      <PageHeader
        eyebrow="Agent experience"
        title="Feedback & issues"
        description={`Everything your team has flagged while testing ${agentName}, and what happened next.`}
        actions={<Button variant="secondary" onClick={() => navigate('/app/chat')}><FlaskConical size={15} /> Test your agent</Button>}
      />

      {state.scope === 'sessions' && !state.loading && !state.error && (
        <p className="mb-4 rounded-xl border border-line bg-white px-4 py-3 text-sm text-fg-muted">
          Showing feedback from test conversations you ran in this browser. Admins can see the full history for {brandName || 'this brand'}.
        </p>
      )}

      <div role="tablist" aria-label="Filter feedback" className="mb-4 flex flex-wrap gap-1.5">
        {GROUPS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={group === entry.id}
            onClick={() => { setGroup(entry.id); setSelectedId('') }}
            className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors duration-150 ${group === entry.id ? 'border-primary bg-primary-tint font-medium text-primary' : 'border-line bg-white text-fg-muted hover:border-line-strong hover:text-ink'}`}
          >
            {entry.label}
            <span className={`text-xs ${group === entry.id ? 'text-primary' : 'text-fg-muted/70'}`}>{counts[entry.id]}</span>
          </button>
        ))}
      </div>

      {state.loading ? (
        <div className="grid gap-3" aria-busy="true">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-20" />)}</div>
      ) : state.error ? (
        <div role="alert" className="rounded-card border border-danger/20 bg-danger-tint p-5">
          <p className="text-sm font-medium text-danger">{state.error}</p>
          <Button size="sm" variant="secondary" className="mt-3" onClick={load}>Try again</Button>
        </div>
      ) : state.items.length === 0 ? (
        <EmptyState
          icon={MessageSquareWarning}
          title="Everything looks quiet"
          description="Feedback and reported issues will appear here. Try a conversation with your agent and flag anything that doesn’t look right."
          action="Test your agent"
          onAction={() => navigate('/app/chat')}
        />
      ) : visible.length === 0 ? (
        <EmptyState icon={Check} title="Nothing in this view" description="No feedback matches this filter right now." action={group === 'open' ? undefined : 'Show open'} onAction={group === 'open' ? undefined : () => setGroup('open')} />
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <ul className="grid gap-2" aria-label={pluralize(visible.length, 'item')}>
            {visible.map((item) => {
              const name = submitterName(item, user)
              const email = submitterEmail(item, user)
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(item.id)}
                    aria-pressed={selected?.id === item.id}
                    className={`w-full rounded-card border bg-white p-4 text-left shadow-card transition-[border-color,box-shadow] duration-150 hover:border-primary/40 ${selected?.id === item.id ? 'border-primary ring-4 ring-primary/10' : 'border-line'}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="flex items-center gap-2 text-sm font-medium">
                        {isPositive(item) && <ThumbsUp size={14} className="text-success" aria-hidden="true" />}
                        {itemTitle(item)}
                      </p>
                      <StatusChip status={item.status} />
                    </div>
                    <p className="mt-1.5 line-clamp-2 text-sm text-fg-muted">{itemSummary(item)}</p>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5 border-t border-line/60 pt-2.5 text-xs">
                      <span className="inline-flex min-w-0 items-center gap-1.5 font-medium text-ink/90">
                        <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-primary-tint text-[10px] font-bold text-primary">
                          {(name || email || 'U').charAt(0).toUpperCase()}
                        </span>
                        <span className="truncate max-w-[140px] sm:max-w-[180px]">{name}</span>
                        {email && (
                          <span className="truncate max-w-[140px] sm:max-w-[200px] font-normal text-fg-muted">
                            ({email})
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 text-fg-muted/80">
                        {item.kind === 'issue_report' ? 'Issue report' : 'Feedback'} · {timeAgo(item.created_at)}
                      </span>
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
          <aside className="rounded-card border border-line bg-white p-5 shadow-card lg:sticky lg:top-20" aria-live="polite">
            {selected ? (
              <Detail item={selected} currentUser={user} isAdmin={isAdmin} brandId={brandId} agentName={agentName} onStatus={updateStatus} onDeleted={removeItem} />
            ) : (
              <p className="py-10 text-center text-sm text-fg-muted">Select an item to see the details and where it stands.</p>
            )}
          </aside>
        </div>
      )}
      <p className="mt-6 text-xs text-fg-muted">Reported something? <Link to="/app/chat" className="text-primary hover:underline">Open the playground</Link> to continue testing.</p>
    </div>
  )
}

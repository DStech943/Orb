import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowRight,
  BookOpenCheck,
  Check,
  CircleHelp,
  Clock,
  FlaskConical,
  GitBranch,
  MessageSquareWarning,
  PackageX,
  Plug,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react'
import Skeleton from '../ui/Skeleton'
import ProductShowcase from './ProductShowcase'
import Panel from '../ui/Panel'
import { useAuth } from '../../context/AuthContext'
import { useBrand } from '../../context/BrandContext'
import { loadFeedback } from '../../lib/feedbackData'
import { formatDateTime, pluralize, timeAgo } from '../../lib/format'
import { listTestSessions } from '../../lib/testSessions'
import { getBrandVoice, getShopifyCredentialStatus, hasOrbApi, listKnowledge, listOperationalUpdates } from '../../services/orbApi'

/*
 * Semantic colour use on this page (nothing decorative):
 *   indigo  = primary actions and neutral icons     green = healthy / done
 *   amber   = needs attention                       red   = critical
 *   neutral = informational text and counts
 */

const WEEK = 7 * 24 * 3600 * 1000
const hasContent = (value) => (typeof value === 'string' ? value.trim().length > 0 : value && typeof value === 'object' ? Object.keys(value).length > 0 : Boolean(value))
const statusOf = (point) => String(point?.payload?.status ?? point?.status ?? '').toLowerCase()
const countPoints = (points) => {
  const total = { published: 0, drafts: 0, approved: 0 }
  for (const point of points) {
    const status = statusOf(point)
    if (status === 'published' || status === 'active') total.published += 1
    else if (status === 'approved') total.approved += 1
    else total.drafts += 1
  }
  return total
}
const stamp = (point) => point?.payload?.updated_at || point?.payload?.created_at || point?.updated_at || point?.created_at || null
const label = (point) => String(point?.payload?.title || point?.payload?.question || point?.payload?.situation || 'Untitled').trim()
const validDate = (value) => (value && !Number.isNaN(new Date(value).getTime()) ? new Date(value) : null)

/** Real signals only. Anything the API can't tell us for this user is left out, never guessed. */
function useWorkspaceSignals(brand, brandName, isAdmin) {
  const empty = { loading: true, feedback: null, voice: null, shopify: null, faqPoints: null, sopPoints: null, operations: [] }
  const [state, setState] = useState(empty)

  useEffect(() => {
    let live = true
    if (!hasOrbApi || !brand?.id || !brandName) {
      setState((current) => ({ ...current, loading: false }))
      return undefined
    }
    setState(empty)
    // Each signal fills in as soon as it arrives, so one slow request never blocks the page.
    const apply = (patch) => { if (live) setState((current) => ({ ...current, ...patch })) }
    const pending = [
      loadFeedback(brand.id, isAdmin).then((feedback) => apply({ feedback })),
      (isAdmin ? getBrandVoice(brand.id) : Promise.resolve(null)).then((voice) => apply({ voice })),
      getShopifyCredentialStatus(brandName).then((shopify) => apply({ shopify })),
      listKnowledge('faqs', brandName).then((result) => apply({ faqPoints: Array.isArray(result?.points) ? result.points : [] })),
      listKnowledge('sops', brandName).then((result) => apply({ sopPoints: Array.isArray(result?.points) ? result.points : [] })),
      listOperationalUpdates(brandName).then((result) => apply({ operations: Array.isArray(result?.updates) ? result.updates : [] })),
    ].map((request) => request.catch(() => null))
    Promise.all(pending).then(() => apply({ loading: false }))
    const giveUp = window.setTimeout(() => apply({ loading: false }), 8000)
    return () => { live = false; window.clearTimeout(giveUp) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brand?.id, brandName, isAdmin])

  return state
}

const TONE = {
  success: 'bg-success-tint text-success',
  warning: 'bg-warning-tint text-warning',
  danger: 'bg-danger-tint text-danger',
  neutral: 'bg-subtle text-fg-muted',
  primary: 'bg-primary-tint text-primary',
}
const DOT = { success: 'bg-success', warning: 'bg-warning', danger: 'bg-danger', neutral: 'bg-line-strong', primary: 'bg-primary' }

function Pill({ tone = 'neutral', children, title }) {
  return (
    <span title={title} className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${TONE[tone]}`}>
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${DOT[tone]}`} />
      {children}
    </span>
  )
}

export default function AgentHome({ overview, onRetry, middle = null }) {
  const { isAdmin } = useAuth()
  const { brand, brandName, agentName } = useBrand()
  const signals = useWorkspaceSignals(brand, brandName, isAdmin)
  const counts = overview.counts || {}
  // FAQ and SOP counts come from the lists this page already loads, so they appear as soon as
  // those arrive instead of waiting on the slower product and operations requests.
  const faqs = signals.faqPoints ? countPoints(signals.faqPoints) : counts.faqs || {}
  const sops = signals.sopPoints ? countPoints(signals.sopPoints) : counts.sops || {}
  const flows = counts.flows || {}
  const products = Array.isArray(overview.products) ? overview.products : []
  const outOfStock = products.filter((product) => product.isOutOfStock).length
  const awaitingLists = signals.loading && (signals.faqPoints === null || signals.sopPoints === null)
  const knowledgeLoading = awaitingLists && overview.blockStatus?.metrics === 'loading'
  const knowledgeError = !awaitingLists && !signals.faqPoints && !signals.sopPoints && overview.blockStatus?.metrics === 'error'
  const firstName = overview.user?.firstName || 'there'

  // Testing history. The agent API cannot list sessions, so a brand's test sessions are the
  // union of (a) sessions this user ran for this brand and (b) sessions that received feedback
  // (brand-wide for admins). Both are scoped to this brand and never mix brands.
  const localSessions = useMemo(() => listTestSessions(brand?.id), [brand?.id])
  const feedbackItems = signals.feedback?.items || null
  const sessionIds = useMemo(() => {
    const ids = new Set(localSessions.map((session) => session.id))
    ;(feedbackItems || []).forEach((item) => { if (item.session_id) ids.add(item.session_id) })
    return ids
  }, [localSessions, feedbackItems])
  const lastTested = useMemo(() => {
    const times = [
      ...localSessions.map((session) => validDate(session.updatedAt)),
      ...(feedbackItems || []).map((item) => validDate(item.created_at)),
    ].filter(Boolean)
    return times.length ? new Date(Math.max(...times.map((date) => date.getTime()))) : null
  }, [localSessions, feedbackItems])
  const testedKnown = !signals.loading || localSessions.length > 0

  const openFeedback = feedbackItems ? feedbackItems.filter((item) => item.status === 'open').length : null
  const drafts = Number(faqs.drafts || 0) + Number(sops.drafts || 0) + Number(faqs.approved || 0) + Number(sops.approved || 0)
  const updatedThisWeek = useMemo(() => {
    const cutoff = Date.now() - WEEK
    return [...(signals.faqPoints || []), ...(signals.sopPoints || [])].filter((point) => {
      const date = validDate(stamp(point))
      return date && date.getTime() >= cutoff
    }).length
  }, [signals.faqPoints, signals.sopPoints])

  const voiceState = signals.voice
    ? hasContent(signals.voice.agent_tone) || (signals.voice.profiles || []).some((profile) => profile.status === 'approved')
    : null
  const integrationState = signals.shopify && !signals.loading ? Boolean(signals.shopify.token_available && signals.shopify.domain) : null

  const steps = [
    { key: 'identity', title: 'Name your agent and describe your brand', action: 'Set up your agent', done: Boolean(brand?.ai_agent_name && (brand?.description || brand?.profile?.website_url)), to: '/app/workspace', icon: SlidersHorizontal },
    { key: 'faqs', title: 'Add FAQs', action: 'Add your first FAQs', hint: Number(faqs.drafts || 0) > 0 ? `${pluralize(Number(faqs.drafts), 'draft')} waiting for review` : '', done: Number(faqs.published || 0) > 0, to: '/app/brain?tab=faqs', icon: CircleHelp },
    { key: 'sops', title: 'Add SOPs', action: 'Add your first SOPs', hint: Number(sops.drafts || 0) > 0 ? `${pluralize(Number(sops.drafts), 'draft')} waiting for review` : '', done: Number(sops.published || 0) > 0, to: '/app/brain?tab=sops', icon: BookOpenCheck },
    { key: 'voice', title: 'Set how your agent sounds', action: 'Configure AI behaviour', done: voiceState, to: '/app/workspace?tab=voice', icon: SlidersHorizontal },
    { key: 'integrations', title: 'Connect your store or tools', action: 'Connect your tools', done: integrationState, to: '/app/tools', icon: Plug },
    { key: 'tested', title: 'Test your agent', action: 'Test your agent', done: testedKnown ? sessionIds.size > 0 : null, to: '/app/chat', icon: FlaskConical },
  ]
  const known = steps.filter((step) => step.done !== null)
  const doneCount = known.filter((step) => step.done).length
  const missing = steps.filter((step) => step.done === false)
  const nextStep = missing[0]

  const actions = []
  if (drafts > 0) actions.push({ to: '/app/brain?tab=faqs&status=draft', title: `Review ${pluralize(drafts, 'draft')}`, text: 'Approve what is accurate so your agent can use it.', icon: BookOpenCheck, urgent: true })
  if (openFeedback > 0) actions.push({ to: '/app/feedback', title: `Review ${pluralize(openFeedback, 'open item')}`, text: 'See what your team flagged.', icon: MessageSquareWarning, urgent: true })
  missing.forEach((step) => actions.push({ to: step.to, title: step.action, text: step.hint || '', icon: step.icon }))
  ;[
    { to: '/app/brain?tab=faqs', title: 'Add an FAQ', text: 'Teach your agent a customer answer.', icon: CircleHelp },
    { to: '/app/brain?tab=sops', title: 'Create an SOP', text: 'Document a process step by step.', icon: BookOpenCheck },
    { to: '/app/workspace?tab=voice', title: 'Configure AI behaviour', text: 'Tone, voice and guidelines.', icon: SlidersHorizontal },
    { to: '/app/chat', title: 'Test your agent', text: 'Ask a question and review the answer.', icon: FlaskConical },
    { to: '/app/feedback', title: 'Review feedback', text: 'Track issues and what happened next.', icon: MessageSquareWarning },
  ].forEach((fallback) => actions.push(fallback))
  const quickActions = actions.filter((action, index, all) => all.findIndex((other) => other.to === action.to) === index).slice(0, 4)

  const published = Number(faqs.published || 0) + Number(sops.published || 0)
  const agentReady = published > 0
  const statusTone = knowledgeLoading ? 'neutral' : agentReady ? 'success' : 'warning'
  const statusText = knowledgeLoading ? 'Checking…' : agentReady ? 'Ready to help' : 'Still learning'

  const attention = []
  if (!knowledgeLoading && !knowledgeError && published === 0) attention.push({ to: '/app/brain', text: 'No published knowledge yet. Your agent has nothing to rely on.', tone: 'danger', cta: 'Add knowledge' })
  if (outOfStock > 0) attention.push({ to: '/app/products', text: `${pluralize(outOfStock, 'product')} out of stock`, tone: 'danger', cta: 'View', icon: PackageX })
  if (drafts > 0) attention.push({ to: '/app/brain?tab=faqs&status=draft', text: `${pluralize(drafts, 'draft')} waiting for your review`, tone: 'warning', cta: 'Review' })
  if (openFeedback > 0) attention.push({ to: '/app/feedback', text: `${pluralize(openFeedback, 'feedback item')} still open`, tone: 'warning', cta: 'Open' })

  const activity = useMemo(() => {
    const entries = []
    const knowledge = (points, noun, to, icon) => (points || []).forEach((point) => {
      const status = statusOf(point)
      const isLive = status === 'published' || status === 'active'
      entries.push({ at: stamp(point), title: label(point), meta: `${noun} updated`, status: isLive ? ['success', 'Published'] : ['warning', status === 'approved' ? 'Approved' : 'Draft'], to, icon })
    })
    knowledge(signals.faqPoints, 'FAQ', '/app/brain?tab=faqs', CircleHelp)
    knowledge(signals.sopPoints, 'SOP', '/app/brain?tab=sops', BookOpenCheck)
    ;(feedbackItems || []).forEach((item) => entries.push({
      at: item.created_at,
      title: item.note || item.agent_reply || (item.kind === 'issue_report' ? 'Issue reported' : 'Feedback submitted'),
      meta: item.kind === 'issue_report' ? 'Issue reported' : 'Feedback submitted',
      status: item.status === 'resolved' ? ['success', 'Resolved'] : item.status === 'open' ? ['warning', 'Open'] : ['neutral', 'In progress'],
      to: '/app/feedback',
      icon: MessageSquareWarning,
    }))
    ;(signals.operations || []).forEach((update) => entries.push({ at: update.created_at, title: String(update.message || 'Operation logged'), meta: 'Operation logged', status: ['neutral', 'Logged'], to: '/app/operations', icon: GitBranch }))
    localSessions.forEach((session) => entries.push({ at: session.updatedAt, title: session.title && session.title !== 'New test' ? session.title : 'Test conversation', meta: 'Test conversation', status: ['neutral', pluralize(session.messageCount || 0, 'message')], to: '/app/chat', icon: FlaskConical }))
    return entries.filter((entry) => validDate(entry.at)).sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 6)
  }, [signals.faqPoints, signals.sopPoints, signals.operations, feedbackItems, localSessions])

  const sessionNote = lastTested ? `Last tested ${timeAgo(lastTested)}` : testedKnown ? 'Not tested yet' : 'Checking…'
  const stats = [
    { label: 'Published FAQs', value: faqs.published || 0, icon: CircleHelp, to: '/app/brain?tab=faqs', note: Number(faqs.drafts || 0) ? `${faqs.drafts} in draft` : Number(faqs.published || 0) ? 'All published' : 'Nothing published yet', tone: Number(faqs.drafts || 0) || !Number(faqs.published || 0) ? 'warning' : 'success' },
    { label: 'Published SOPs', value: sops.published || 0, icon: BookOpenCheck, to: '/app/brain?tab=sops', note: Number(sops.drafts || 0) ? `${sops.drafts} in draft` : Number(sops.published || 0) ? 'All published' : 'Nothing published yet', tone: Number(sops.drafts || 0) || !Number(sops.published || 0) ? 'warning' : 'success' },
    { label: 'Published flows', value: flows.published || 0, icon: GitBranch, to: '/app/flows', note: Number(flows.drafts || 0) ? `${flows.drafts} in draft` : Number(flows.published || 0) ? 'All published' : 'No flows yet', tone: Number(flows.drafts || 0) ? 'warning' : Number(flows.published || 0) ? 'success' : 'neutral' },
    { label: isAdmin ? 'Test sessions' : 'Your test sessions', value: testedKnown ? sessionIds.size : '–', icon: FlaskConical, to: '/app/chat', note: sessionNote, tone: lastTested ? 'neutral' : 'warning' },
  ]

  const facts = [
    { icon: GitBranch, text: `${pluralize(Number(flows.published || 0), 'published flow')}` },
    { icon: BookOpenCheck, text: `${faqs.published || 0} FAQs · ${sops.published || 0} SOPs live` },
    { icon: Clock, text: lastTested ? `Last tested ${timeAgo(lastTested)}` : testedKnown ? 'Not tested yet' : 'Checking tests…', title: lastTested ? formatDateTime(lastTested) : undefined },
  ]

  return (
    <div className="grid gap-5">
      {/* Agent identity: the dedicated agent for this brand is the centre of the workspace. */}
      <section className="relative overflow-hidden rounded-2xl border border-white/70 bg-gradient-to-br from-[#FFEBDA] via-[#FFDDC2] to-[#FFD0AE] p-4 text-ink shadow-[0_12px_30px_-16px_rgba(200,110,40,0.4)] sm:p-5">
        <div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-24 h-64 w-64 rounded-full bg-white/45" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-28 right-32 hidden h-52 w-52 rounded-full bg-[#FF9A52]/20 blur-2xl sm:block" />
        <div className="relative lg:pr-[36%]">
          <div className="flex min-w-0 items-center gap-3">
            <span className="relative grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white text-base font-semibold text-primary shadow-sm" aria-hidden="true">
              {(agentName || 'AI').slice(0, 1).toUpperCase()}
              <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white ${DOT[statusTone]}`} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <h2 className="font-display truncate text-xl font-medium leading-tight">{agentName}</h2>
                <Pill tone={statusTone}>{statusText}</Pill>
              </div>
              <p className="truncate text-xs text-ink/65">AI agent for <span className="font-medium text-ink/85">{brandName || 'your brand'}</span> · Welcome back, <em className="font-display not-italic italic text-ink">{firstName}</em></p>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <Link to={nextStep?.to || '/app/chat'} className="inline-flex h-9 items-center gap-2 rounded-control bg-primary px-3.5 text-sm font-medium text-white shadow-[0_6px_16px_-6px_rgba(99,91,255,0.7)] transition-[transform,background-color] duration-150 hover:-translate-y-0.5 hover:bg-primary-dark">
              {nextStep ? nextStep.action : `Chat with ${agentName}`} <ArrowRight size={14} aria-hidden="true" />
            </Link>
            {nextStep && nextStep.key !== 'tested' && (
              <Link to="/app/chat" className="inline-flex h-9 items-center gap-2 rounded-control border border-white/80 bg-white/70 px-3.5 text-sm font-medium text-ink transition-colors hover:bg-white">
                <FlaskConical size={14} aria-hidden="true" /> Test your agent
              </Link>
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {knowledgeLoading ? (
              <Skeleton className="h-6 w-64 rounded-full" />
            ) : (
              <>
                {facts.slice(0, 3).map((fact) => (
                  <span key={fact.text} title={fact.title} className="inline-flex items-center gap-1 rounded-full border border-white/70 bg-white/55 px-2 py-0.5 text-[11px] text-ink/75">
                    <fact.icon size={11} aria-hidden="true" /> {fact.text}
                  </span>
                ))}
                {openFeedback > 0 && (
                  <Link to="/app/feedback" className="inline-flex items-center gap-1 rounded-full bg-warning-tint px-2 py-0.5 text-[11px] font-medium text-warning transition-colors hover:bg-[#FAEBC8]">
                    <MessageSquareWarning size={11} aria-hidden="true" /> {openFeedback} open
                  </Link>
                )}
              </>
            )}
          </div>
        </div>
        <div className="pointer-events-none absolute inset-y-0 right-3 hidden w-[34%] lg:block">
          <div className="pointer-events-auto h-full">
            <ProductShowcase products={overview.products} productError={overview.blockErrors?.products || overview.productError} loading={overview.blockStatus?.products === 'loading'} brandName={brandName} />
          </div>
        </div>
      </section>

      <section aria-labelledby="actions-title">
        <h3 id="actions-title" className="font-display mb-2.5 text-lg font-medium">What to do <em>next</em></h3>
        {knowledgeLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-20" />)}</div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {quickActions.map((action) => (
              <Link key={action.to + action.title} to={action.to} className="group flex items-start gap-3 rounded-card border border-line bg-white p-3.5 shadow-card transition-[border-color,transform,box-shadow] duration-180 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-pop">
                <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${action.urgent ? TONE.warning : TONE.primary}`}><action.icon size={17} aria-hidden="true" /></span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2 text-sm font-semibold">
                    <span className="truncate">{action.title}</span>
                    <ArrowRight size={14} className="shrink-0 text-fg-muted transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden="true" />
                  </span>
                  <span className="mt-0.5 block text-xs leading-5 text-fg-muted">{action.text || ' '}</span>
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="agent-title">
        <h3 id="agent-title" className="font-display mb-2.5 text-lg font-medium"><em>{agentName}</em> at a glance</h3>
        {knowledgeLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-24" />)}</div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {stats.map((item) => (
              <Link key={item.label} to={item.to} className="group rounded-card border border-line bg-white p-4 shadow-card transition-[border-color,transform,box-shadow] duration-180 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-pop">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm text-fg-muted">{item.label}</p>
                  <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary-tint text-primary"><item.icon size={14} aria-hidden="true" /></span>
                </div>
                <p className="font-display mt-1.5 text-4xl font-medium leading-none text-ink">{item.value}</p>
                <p className="mt-1 flex items-center gap-1.5 text-xs text-fg-muted">
                  <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOT[item.tone]}`} />
                  {item.note}
                </p>
              </Link>
            ))}
          </div>
        )}
      </section>

      {middle}

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel
          id="attention-title"
          title="Needs your attention"
          count={attention.length || undefined}
          countTone={attention.some((item) => item.tone === 'danger') ? 'danger' : 'warning'}
        >
          {attention.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-fg-muted"><Check size={15} className="text-success" aria-hidden="true" /> All clear. Nothing needs attention right now.</p>
          ) : (
            <ul className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1">
              {attention.map((item) => (
                <li key={item.text} className="min-w-0">
                  <Link to={item.to} className="group flex min-w-0 items-center gap-3 rounded-lg px-2 py-2 text-sm transition-colors hover:bg-canvas">
                    <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${TONE[item.tone]}`}>{item.icon ? <item.icon size={14} aria-hidden="true" /> : <AlertTriangle size={14} aria-hidden="true" />}</span>
                    <span className="min-w-0 flex-1 leading-5">{item.text}</span>
                    <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-primary">{item.cta} <ArrowRight size={12} aria-hidden="true" /></span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel id="activity-title" title="Recent activity" action={activity.length ? { to: '/app/feedback', label: 'Feedback' } : undefined}>
          {signals.loading && activity.length === 0 ? (
            <div className="grid gap-2">{Array.from({ length: 3 }, (_, index) => <Skeleton key={index} className="h-9" />)}</div>
          ) : activity.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-fg-muted"><Sparkles size={15} className="text-primary" aria-hidden="true" /> Nothing yet. Updates to {brandName || 'this brand'} will appear here as your team works.</p>
          ) : (
            <ul className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1">
              {activity.map((entry, index) => (
                <li key={`${entry.at}-${index}`} className="min-w-0">
                  <Link to={entry.to} className="group flex min-w-0 items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-canvas">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-subtle text-fg-muted"><entry.icon size={14} aria-hidden="true" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm" title={entry.title}>{entry.title}</span>
                      <span className="mt-0.5 flex items-center gap-2 text-xs text-fg-muted">
                        {entry.meta}
                        <Pill tone={entry.status[0]}>{entry.status[1]}</Pill>
                      </span>
                    </span>
                    <time className="shrink-0 text-xs text-fg-muted" dateTime={new Date(entry.at).toISOString()} title={formatDateTime(entry.at)}>{timeAgo(entry.at)}</time>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
      {knowledgeError && (
        <div role="alert" className="rounded-xl bg-danger-tint px-4 py-3 text-sm text-danger">
          We couldn’t load your knowledge right now.
          <button type="button" onClick={onRetry} className="ml-2 font-medium underline">Try again</button>
        </div>
      )}
    </div>
  )
}

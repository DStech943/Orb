import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Loader2, MessageSquareText } from 'lucide-react'
import ChatMessageText from './ChatMessageText'
import { getBrandAgentFeedbackReport, getBrandChatHistory, hasBrandAgentApi } from '../../services/orbApi'

const textOf = (message) =>
  typeof message === 'string'
    ? message.trim()
    : String(message?.text || message?.content || message?.message || message?.response || message?.reply || '').trim()
const roleOf = (message) => {
  const role = String(message?.role || message?.sender || '').toLowerCase()
  return role === 'user' || role === 'customer' || role === 'human' ? 'user' : 'agent'
}
const normalize = (list) =>
  (Array.isArray(list) ? list : [])
    .map((message, index) => ({ id: message?.id || `m-${index}`, role: roleOf(message), text: textOf(message), createdAt: message?.created_at || message?.createdAt || message?.timestamp || '' }))
    .filter((message) => message.text)

const when = (value) => {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

/**
 * "Show full conversation" for one piece of feedback. The copy saved with the feedback is
 * used when there is one; otherwise the report's saved snapshot, and finally the live
 * session history from the agent. The reply that was flagged is highlighted.
 */
export default function FeedbackConversation({ item, brandId, agentName = 'Agent' }) {
  const [open, setOpen] = useState(false)
  const [state, setState] = useState({ status: 'idle', messages: [], source: '' })
  const flaggedRef = useRef(null)

  const saved = useMemo(() => normalize(item.conversation_history), [item.conversation_history])
  const canLoad = saved.length > 0 || item.kind === 'issue_report' || Boolean(item.session_id)

  useEffect(() => {
    // A different feedback item: close and forget the previous conversation.
    setOpen(false)
    setState({ status: 'idle', messages: [], source: '' })
  }, [item.id])

  useEffect(() => {
    if (!open || state.status !== 'idle') return undefined
    let live = true
    const done = (messages, source) => live && setState({ status: messages.length ? 'ready' : 'empty', messages, source })
    const run = async () => {
      setState({ status: 'loading', messages: [], source: '' })
      if (saved.length) return done(saved, 'saved')
      if (item.kind === 'issue_report') {
        try {
          const result = await getBrandAgentFeedbackReport(brandId, item.id)
          const snapshot = normalize(result?.snapshot?.messages)
          if (snapshot.length) return done(snapshot, 'snapshot')
        } catch {
          // fall through to the live history
        }
      }
      if (item.session_id && hasBrandAgentApi) {
        try {
          const result = await getBrandChatHistory(brandId, item.session_id)
          const history = normalize(Array.isArray(result?.messages) ? result.messages : result?.history)
          if (history.length) return done(history, 'live')
        } catch {
          // the session may have been deleted
        }
      }
      done([], '')
    }
    run()
    return () => { live = false }
  }, [open, state.status, saved, item, brandId])

  const flaggedId = item.message_id || ''
  const isFlagged = (message) => (flaggedId && message.id === flaggedId) || (!flaggedId && item.agent_reply && message.role === 'agent' && message.text === String(item.agent_reply).trim())

  useEffect(() => {
    if (state.status === 'ready') flaggedRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [state.status])

  if (!canLoad) {
    return <p className="text-xs text-fg-muted">The full conversation wasn’t saved with this feedback.</p>
  }

  return (
    <section aria-label="Full conversation">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="inline-flex h-8 items-center gap-2 rounded-full border border-line-strong bg-white/80 px-3 text-xs font-medium text-ink shadow-card transition-colors hover:bg-white"
      >
        <MessageSquareText size={14} aria-hidden="true" />
        {open ? 'Hide full conversation' : 'Show full conversation'}
        <ChevronDown size={14} aria-hidden="true" className={`transition-transform duration-300 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="mt-3 animate-fade-in">
          {state.status === 'loading' && <p className="flex items-center gap-2 text-xs text-fg-muted"><Loader2 size={14} className="animate-spin" /> Loading conversation…</p>}
          {state.status === 'empty' && <p className="rounded-xl border border-dashed border-line-strong bg-white/60 p-3 text-xs text-fg-muted">This conversation isn’t available any more. It may not have been saved, or the session was deleted.</p>}
          {state.status === 'ready' && (
            <>
              <p className="mb-2 text-[11px] text-fg-muted">
                {state.messages.length} message{state.messages.length === 1 ? '' : 's'}
                {state.source === 'live' ? ' · live from the agent’s session' : ' · saved with this feedback'}
              </p>
              <ol className="thin-scroll max-h-[28rem] space-y-2.5 overflow-y-auto rounded-2xl border border-line bg-white/60 p-3">
                {state.messages.map((message) => {
                  const fromUser = message.role === 'user'
                  const flagged = isFlagged(message)
                  return (
                    <li key={message.id} ref={flagged ? flaggedRef : undefined} className={`flex ${fromUser ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm leading-6 ${fromUser ? 'rounded-br-md bg-primary text-white' : 'rounded-bl-md border border-line bg-white text-ink'} ${flagged ? 'ring-2 ring-orange' : ''}`}>
                        <p className={`mb-0.5 flex flex-wrap items-center gap-x-2 text-[11px] font-medium ${fromUser ? 'text-white/75' : 'text-fg-muted'}`}>
                          {fromUser ? 'Tester' : agentName}
                          {when(message.createdAt) && <span className="font-normal">{when(message.createdAt)}</span>}
                          {flagged && <span className="rounded bg-orange px-1.5 py-px text-[10px] font-semibold text-ink">Flagged reply</span>}
                        </p>
                        <ChatMessageText text={message.text} isUser={fromUser} />
                      </div>
                    </li>
                  )
                })}
              </ol>
            </>
          )}
        </div>
      )}
    </section>
  )
}

import React, { useEffect, useRef, useState } from 'react'
import {
  AlertCircle,
  Check,
  CheckCheck,
  Clock,
  CornerDownRight,
  FileEdit,
  MessageSquare,
  Quote,
  RefreshCw,
  Send,
  Smile,
  Sparkles,
  X,
  Zap,
} from 'lucide-react'
import Avatar from '../components/ui/Avatar'
import Button from '../components/ui/Button'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { activeBrandName } from '../services/orbApi'
import {
  PRESET_REACTIONS,
  clearClientChatMessages,
  getClientChatMessages,
  sendClientChatMessage,
  toggleMessageReaction,
} from '../services/clientChat'

export default function ClientChat() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const brandName = activeBrandName() || 'Your Brand'
  const currentUserName = user?.name || user?.email?.split('@')[0] || 'You'

  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [inputMessage, setInputMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [updateType, setUpdateType] = useState('general') // 'general' | 'sop_update' | 'ops_change'
  const [replyingTo, setReplyingTo] = useState(null)
  const [justSentId, setJustSentId] = useState(null)
  const [reactionMenuMsgId, setReactionMenuMsgId] = useState(null)

  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

  const loadMessages = async () => {
    try {
      const data = await getClientChatMessages(brandName, user)
      setMessages(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setLoading(true)
    loadMessages()

    const handleUpdate = () => {
      loadMessages()
    }
    const onBrandChanged = () => {
      loadMessages()
    }

    window.addEventListener('orb:client-chat-updated', handleUpdate)
    window.addEventListener('orb:brand-changed', onBrandChanged)

    return () => {
      window.removeEventListener('orb:client-chat-updated', handleUpdate)
      window.removeEventListener('orb:brand-changed', onBrandChanged)
    }
  }, [brandName, user])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, sending])

  const handleSend = async (e) => {
    e?.preventDefault()
    if (!inputMessage.trim() || sending) return

    const text = inputMessage
    const currentReply = replyingTo
    setInputMessage('')
    setReplyingTo(null)
    setSending(true)

    try {
      const sent = await sendClientChatMessage({
        brandName,
        content: text,
        currentUser: user,
        updateType,
        replyTo: currentReply,
      })
      setJustSentId(sent.id)
      await loadMessages()
      showToast('Message sent to Orb team')
    } catch (err) {
      showToast(err.message || 'Failed to send message', 'error')
      setInputMessage(text)
      setReplyingTo(currentReply)
    } finally {
      setSending(false)
      setTimeout(() => {
        setJustSentId(null)
      }, 700)
      inputRef.current?.focus()
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleReact = async (messageId, emoji) => {
    setReactionMenuMsgId(null)
    await toggleMessageReaction({
      brandName,
      messageId,
      emoji,
      userName: currentUserName,
    })
    loadMessages()
  }

  const formatTime = (isoString) => {
    if (!isoString) return ''
    const date = new Date(isoString)
    return new Intl.DateTimeFormat(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    }).format(date)
  }

  const isClient = (sender) => {
    return sender.role === 'client' || sender.id === user?.id
  }

  const renderStatus = (status) => {
    if (status === 'failed') {
      return (
        <span className="flex items-center gap-0.5 text-rose-500 font-semibold" title="Failed to deliver">
          <AlertCircle size={12} /> Failed
        </span>
      )
    }
    if (status === 'read') {
      return (
        <span className="flex items-center gap-0.5 text-purple font-medium" title="Read by team">
          <CheckCheck size={13} /> Read
        </span>
      )
    }
    return (
      <span className="flex items-center gap-0.5 text-slate-400 font-medium" title="Sent">
        <Check size={12} /> Sent
      </span>
    )
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-100px)] max-w-5xl flex-col rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      {/* Top Header Bar */}
      <div className="flex items-center justify-between border-b border-slate-100 bg-white px-6 py-4">
        <div className="flex items-center gap-3.5">
          <div className="relative">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-purple/10 text-purple font-extrabold shadow-sm">
              <MessageSquare size={20} />
            </span>
            <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-emerald-500" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-extrabold text-ink tracking-tight">
                Client Chatspace
              </h2>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                {brandName}
              </span>
            </div>
            <p className="text-xs text-muted">
              Live updates, SOP refinements, and support requests directly with the Orb operations team
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => loadMessages()}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition"
            title="Refresh conversation"
            aria-label="Refresh conversation"
          >
            <RefreshCw size={15} />
          </button>
          <button
            type="button"
            onClick={async () => {
              if (window.confirm('Reset this chat conversation?')) {
                await clearClientChatMessages(brandName)
                loadMessages()
              }
            }}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
          >
            Reset Thread
          </button>
        </div>
      </div>

      {/* Quick Action Suggestion Bar */}
      <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/70 px-6 py-2 text-xs text-slate-600 overflow-x-auto">
        <span className="font-bold text-slate-500 shrink-0 flex items-center gap-1.5">
          <Sparkles size={13} className="text-purple" /> Quick Requests:
        </span>
        <button
          type="button"
          onClick={() => {
            setInputMessage('Please update our return policy SOP to reflect a 30-day window instead of 14 days.')
            setUpdateType('sop_update')
          }}
          className="shrink-0 rounded-full border border-slate-200 bg-white px-3 py-1 font-medium hover:border-purple hover:text-purple transition shadow-2xs"
        >
          📝 Update Return Policy SOP
        </button>
        <button
          type="button"
          onClick={() => {
            setInputMessage('We are running a weekend flash sale: 15% off using code FLASH15 on all orders.')
            setUpdateType('ops_change')
          }}
          className="shrink-0 rounded-full border border-slate-200 bg-white px-3 py-1 font-medium hover:border-purple hover:text-purple transition shadow-2xs"
        >
          ⚡ Announce Promo / Flash Sale
        </button>
        <button
          type="button"
          onClick={() => {
            setInputMessage('Can we add a new support flow for handling lost package inquiries?')
            setUpdateType('sop_update')
          }}
          className="shrink-0 rounded-full border border-slate-200 bg-white px-3 py-1 font-medium hover:border-purple hover:text-purple transition shadow-2xs"
        >
          🔄 New Delivery Support Flow
        </button>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-5 bg-[#FBFBFC]">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <div className="flex items-center gap-2 text-sm text-muted">
              <RefreshCw className="animate-spin" size={18} />
              Loading conversation...
            </div>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <MessageSquare size={36} className="text-slate-300 mb-2" />
            <p className="text-sm font-bold text-ink">No messages yet</p>
            <p className="text-xs text-muted max-w-sm mt-1">
              Start chatting with our team to request knowledge base updates, prompt tweaks, or new support flows.
            </p>
          </div>
        ) : (
          messages.map((msg, index) => {
            const fromClient = isClient(msg.sender)
            const isJustSent = msg.id === justSentId
            const reactions = msg.reactions || {}

            return (
              <div
                key={msg.id || index}
                className={`group relative flex gap-3.5 transition-all duration-300 ease-out ${
                  fromClient ? 'flex-row-reverse justify-start' : 'flex-row justify-start'
                } ${isJustSent ? 'translate-y-2 opacity-90 scale-[0.99]' : 'translate-y-0 opacity-100 scale-100'}`}
              >
                {/* Profile Pic / Avatar */}
                <div className="shrink-0 pt-0.5">
                  {msg.sender.avatar ? (
                    <img
                      src={msg.sender.avatar}
                      alt={msg.sender.name}
                      className="h-9 w-9 rounded-full object-cover border border-slate-200 shadow-2xs"
                    />
                  ) : (
                    <div
                      className={`grid h-9 w-9 place-items-center rounded-xl text-xs font-extrabold text-white shadow-2xs ${
                        fromClient
                          ? 'bg-purple border border-purple/80'
                          : 'bg-slate-800 border border-slate-700'
                      }`}
                      title={msg.sender.name}
                    >
                      {msg.sender.initials || msg.sender.name?.slice(0, 2).toUpperCase() || 'U'}
                    </div>
                  )}
                </div>

                {/* Message Bubble + Actions */}
                <div className={`relative flex flex-col max-w-[76%] ${fromClient ? 'items-end' : 'items-start'}`}>
                  {/* Sender Name & Time */}
                  <div className="flex items-center gap-2 mb-1 px-1">
                    <span className="text-xs font-bold text-slate-700">
                      {fromClient ? 'You' : msg.sender.name}
                    </span>
                    <span className="text-[10px] text-slate-400 font-medium">
                      {formatTime(msg.createdAt)}
                    </span>
                    {!fromClient && (
                      <span className="rounded bg-purple/10 px-1.5 py-0.2 text-[9px] font-bold text-purple uppercase tracking-wider">
                        Orb Team
                      </span>
                    )}
                  </div>

                  {/* Quoted Reply Snippet if present */}
                  {msg.replyToSnippet && (
                    <div
                      className={`flex items-center gap-1.5 mb-1.5 rounded-lg px-2.5 py-1 text-[11px] border border-slate-200/80 bg-slate-100/80 text-slate-600 max-w-full truncate ${
                        fromClient ? 'rounded-tr-xs' : 'rounded-tl-xs'
                      }`}
                      title={`Replying to message ID: ${msg.replyToId}`}
                    >
                      <Quote size={11} className="text-purple shrink-0" />
                      <span className="font-semibold text-slate-500 shrink-0">Replying:</span>
                      <span className="truncate italic">"{msg.replyToSnippet}"</span>
                      {msg.replyToId && (
                        <span className="text-[9px] text-slate-400 ml-1 shrink-0">
                          (#{msg.replyToId.slice(0, 6)})
                        </span>
                      )}
                    </div>
                  )}

                  {/* Message Bubble */}
                  <div className="relative group/bubble">
                    <div
                      className={`rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-2xs transition-all ${
                        fromClient
                          ? 'rounded-tr-xs bg-primary text-white selection:bg-white/20'
                          : 'rounded-tl-xs border border-slate-200/90 bg-white text-slate-800'
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{msg.content}</p>

                      {/* Optional Update Proposal Card */}
                      {msg.updateProposal && (
                        <div
                          className={`mt-2.5 rounded-xl p-3 text-xs border ${
                            fromClient
                              ? 'border-white/20 bg-white/10 text-white'
                              : 'border-slate-100 bg-slate-50 text-slate-700'
                          }`}
                        >
                          <div className="flex items-center justify-between font-bold mb-1">
                            <span className="flex items-center gap-1.5">
                              {msg.updateProposal.type === 'sop_update' ? (
                                <FileEdit size={14} className={fromClient ? 'text-white' : 'text-purple'} />
                              ) : (
                                <Zap size={14} className={fromClient ? 'text-white' : 'text-amber-500'} />
                              )}
                              {msg.updateProposal.title}
                            </span>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wider ${
                                msg.updateProposal.state === 'completed'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {msg.updateProposal.state}
                            </span>
                          </div>
                          <p className={`text-[11px] leading-normal ${fromClient ? 'text-white/80' : 'text-slate-500'}`}>
                            {msg.updateProposal.details}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Floating Hover Action Bar (Reply & Reaction) */}
                    <div
                      className={`absolute top-1 hidden group-hover/bubble:flex items-center gap-1 bg-white border border-slate-200 shadow-md rounded-lg p-1 z-10 ${
                        fromClient ? '-left-20' : '-right-20'
                      }`}
                    >
                      {/* React Button */}
                      <button
                        type="button"
                        onClick={() =>
                          setReactionMenuMsgId(reactionMenuMsgId === msg.id ? null : msg.id)
                        }
                        className="p-1 rounded text-slate-500 hover:bg-slate-100 hover:text-purple"
                        title="React with emoji"
                      >
                        <Smile size={14} />
                      </button>

                      {/* Quote Reply Button */}
                      <button
                        type="button"
                        onClick={() => {
                          setReplyingTo(msg)
                          inputRef.current?.focus()
                        }}
                        className="p-1 rounded text-slate-500 hover:bg-slate-100 hover:text-purple"
                        title="Quote reply"
                      >
                        <CornerDownRight size={14} />
                      </button>
                    </div>

                    {/* Emoji Picker Popup (4 Set Emojis: 👍, ❤️, 🚀, 👀) */}
                    {reactionMenuMsgId === msg.id && (
                      <div
                        className={`absolute -top-10 flex items-center gap-1.5 bg-white border border-slate-200 shadow-lg rounded-full px-2.5 py-1 z-20 animate-in fade-in zoom-in-95 ${
                          fromClient ? 'right-0' : 'left-0'
                        }`}
                      >
                        {PRESET_REACTIONS.map((emoji) => (
                          <button
                            key={emoji}
                            type="button"
                            onClick={() => handleReact(msg.id, emoji)}
                            className="text-base hover:scale-125 transition-transform px-1 py-0.5 rounded-full hover:bg-slate-100"
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Rendered Emoji Reactions list */}
                  {Object.keys(reactions).length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1 px-1">
                      {Object.entries(reactions).map(([emoji, users]) => {
                        if (!users || users.length === 0) return null
                        const hasReacted = users.includes(currentUserName)
                        return (
                          <button
                            key={emoji}
                            type="button"
                            onClick={() => handleReact(msg.id, emoji)}
                            className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium border transition ${
                              hasReacted
                                ? 'bg-purple/10 border-purple/30 text-purple'
                                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                            }`}
                            title={`Reacted by: ${users.join(', ')}`}
                          >
                            <span>{emoji}</span>
                            <span className="text-[10px] font-bold">{users.length}</span>
                          </button>
                        )
                      })}
                    </div>
                  )}

                  {/* Footer status (Sent, Read, Failed) & Timestamp */}
                  {fromClient && (
                    <div className="mt-1 flex items-center gap-1 text-[10px] text-slate-400 px-1">
                      {renderStatus(msg.status)}
                    </div>
                  )}
                </div>
              </div>
            )
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Quoted reply banner if active */}
      {replyingTo && (
        <div className="flex items-center justify-between border-t border-purple/20 bg-purple/5 px-6 py-2 text-xs">
          <div className="flex items-center gap-2 truncate">
            <CornerDownRight size={14} className="text-purple shrink-0" />
            <span className="font-bold text-purple">
              Replying to {isClient(replyingTo.sender) ? 'yourself' : replyingTo.sender.name}:
            </span>
            <span className="italic text-slate-600 truncate">"{replyingTo.content}"</span>
            <span className="text-[10px] text-slate-400 shrink-0">(#{replyingTo.id.slice(0, 6)})</span>
          </div>
          <button
            type="button"
            onClick={() => setReplyingTo(null)}
            className="p-1 rounded hover:bg-purple/10 text-slate-500 hover:text-slate-800"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Composer Area */}
      <div className="border-t border-slate-200 bg-white p-4">
        {/* Update classification tags */}
        <div className="flex items-center gap-2 mb-2 text-xs">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">
            Update Type:
          </span>
          <button
            type="button"
            onClick={() => setUpdateType('general')}
            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
              updateType === 'general'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            General Query
          </button>
          <button
            type="button"
            onClick={() => setUpdateType('sop_update')}
            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition flex items-center gap-1 ${
              updateType === 'sop_update'
                ? 'bg-purple text-white'
                : 'bg-purple/10 text-purple hover:bg-purple/20'
            }`}
          >
            <FileEdit size={11} /> SOP Request
          </button>
          <button
            type="button"
            onClick={() => setUpdateType('ops_change')}
            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition flex items-center gap-1 ${
              updateType === 'ops_change'
                ? 'bg-amber-600 text-white'
                : 'bg-amber-100 text-amber-800 hover:bg-amber-200'
            }`}
          >
            <Zap size={11} /> Operations Change
          </button>
        </div>

        {/* Input box */}
        <form onSubmit={handleSend} className="relative flex items-center gap-2">
          <textarea
            ref={inputRef}
            rows={2}
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              replyingTo
                ? `Type your reply to #${replyingTo.id.slice(0, 6)}...`
                : `Message our team about ${brandName}... (e.g., "Please update the shipping timeline SOP to 3 days")`
            }
            className="flex-1 resize-none rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-purple focus:outline-none focus:ring-2 focus:ring-purple/10"
          />
          <button
            type="submit"
            disabled={!inputMessage.trim() || sending}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary text-white shadow-sm transition hover:bg-primary-dark disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Send message"
          >
            <Send size={18} className={sending ? 'translate-x-1 opacity-50' : ''} />
          </button>
        </form>
        <div className="flex justify-between items-center mt-1.5 px-1 text-[11px] text-slate-400">
          <span>Press Enter to send, Shift + Enter for new line</span>
          <span>Status shows delivery & read states in real-time</span>
        </div>
      </div>
    </div>
  )
}

import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  Check,
  CheckCheck,
  CornerDownRight,
  FileText,
  Image as ImageIcon,
  Loader2,
  MessageSquare,
  Paperclip,
  Quote,
  RefreshCw,
  Send,
  Smile,
  X,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { activeBrandName } from '../services/orbApi'
import {
  PRESET_REACTIONS,
  getClientChatMessages,
  markChatspaceAsRead,
  sendClientChatMessage,
  subscribeToChatMessages,
  toggleMessageReaction,
  uploadChatspaceMedia,
} from '../services/clientChat'

const PRESET_MENTIONS = [
  { id: 'all', handle: 'all', label: '@all', role: 'Channel', description: 'Notify everyone in this brand chatspace', icon: '📢' },
  { id: 'team', handle: 'team', label: '@team', role: 'Orb Team', description: 'Notify all Orb operations & engineering specialists', icon: '👥' },
  { id: 'orb-ops', handle: 'Orb Operations', label: '@Orb Operations', role: 'Orb Ops', description: 'Orb operations & catalog sync team', icon: '🛡️' },
  { id: 'support-team', handle: 'Support Team', label: '@Support Team', role: 'Customer Support', description: 'Customer support leads', icon: '💬' },
  { id: 'client', handle: 'Client', label: '@Client', role: 'Brand Team', description: 'Brand owners & client team members', icon: '👤' },
  { id: 'parthavi', handle: 'Parthavi Gaikwad', label: '@Parthavi Gaikwad', role: 'Orb Team', description: 'Orb team specialist', icon: '👤' },
]

export default function ClientChat() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const brandName = activeBrandName() || 'Your Brand'
  const currentUserName = user?.name || user?.email?.split('@')[0] || 'You'

  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [inputMessage, setInputMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [replyingTo, setReplyingTo] = useState(null)
  const [justSentId, setJustSentId] = useState(null)
  const [reactionMenuMsgId, setReactionMenuMsgId] = useState(null)
  const [contextMenu, setContextMenu] = useState(null) // { x, y, message }
  const [wsConnected, setWsConnected] = useState(false)
  const [attachedFiles, setAttachedFiles] = useState([])
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef(null)

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
    const onWsStatus = (e) => {
      if (e.detail?.connected !== undefined) {
        setWsConnected(Boolean(e.detail.connected))
      }
    }

    window.addEventListener('orb:client-chat-updated', handleUpdate)
    window.addEventListener('orb:brand-changed', onBrandChanged)
    window.addEventListener('orb:chatspace-ws-status', onWsStatus)

    // Realtime WebSocket & database sync
    const unsubscribe = subscribeToChatMessages(brandName, () => {
      loadMessages()
    })

    return () => {
      window.removeEventListener('orb:client-chat-updated', handleUpdate)
      window.removeEventListener('orb:brand-changed', onBrandChanged)
      window.removeEventListener('orb:chatspace-ws-status', onWsStatus)
      if (typeof unsubscribe === 'function') unsubscribe()
    }
  }, [brandName, user])

  // Mark chat as read when viewing this brand space or when messages update
  useEffect(() => {
    markChatspaceAsRead(brandName)
  }, [brandName, messages.length])

  useEffect(() => {
    const onFocus = () => markChatspaceAsRead(brandName)
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [brandName])

  // Dynamic mention targets combining presets + actual participants
  const mentionTargets = useMemo(() => {
    const list = [...PRESET_MENTIONS]
    const seenNames = new Set(list.map((m) => m.handle.toLowerCase()))

    messages.forEach((m) => {
      const name = m.sender?.name?.trim()
      if (name && !seenNames.has(name.toLowerCase()) && name !== 'You' && name !== currentUserName) {
        seenNames.add(name.toLowerCase())
        list.push({
          id: `member-${name}`,
          handle: name,
          label: `@${name}`,
          role: m.sender.role === 'team' ? 'Orb Team' : 'Member',
          description: `Direct message to ${name}`,
          avatar: m.sender.avatar,
          initials: m.sender.initials || name.slice(0, 2).toUpperCase(),
        })
      }
    })

    return list
  }, [messages, currentUserName])

  const [mentionMenuOpen, setMentionMenuOpen] = useState(false)
  const [mentionQuery, setMentionQuery] = useState('')
  const [mentionCursorIndex, setMentionCursorIndex] = useState(0)
  const [mentionSelectedIndex, setMentionSelectedIndex] = useState(0)

  const filteredMentions = useMemo(() => {
    if (!mentionMenuOpen) return []
    const q = (mentionQuery || '').toLowerCase().trim()
    if (!q) return mentionTargets
    return mentionTargets.filter(
      (m) =>
        m.handle.toLowerCase().includes(q) ||
        m.label.toLowerCase().includes(q) ||
        m.role?.toLowerCase().includes(q) ||
        m.description?.toLowerCase().includes(q)
    )
  }, [mentionTargets, mentionMenuOpen, mentionQuery])

  // Build comprehensive mention regex supporting full names (e.g. @Parthavi Gaikwad)
  const buildMentionRegex = useMemo(() => {
    return (explicitMentions = []) => {
      const allKnown = new Set([
        ...PRESET_MENTIONS.map((m) => m.handle),
        ...mentionTargets.map((m) => m.handle),
        ...(Array.isArray(explicitMentions) ? explicitMentions : []),
      ])

      const sortedKnown = Array.from(allKnown)
        .filter(Boolean)
        .sort((a, b) => b.length - a.length)
        .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))

      const knownPattern = sortedKnown.length > 0 ? `@(?:${sortedKnown.join('|')})` : ''

      // Multi-word capitalized names: @FirstName LastName (e.g. @Parthavi Gaikwad)
      const capitalizedMultiWord = `@[A-Z][a-zA-Z0-9_]*(?:\\s+[A-Z][a-zA-Z0-9_]*)+`

      // Names with parenthetical roles: @Name (Role) (e.g. @Sarah (Support Lead))
      const withParentheses = `@[a-zA-Z0-9_]+(?:\\s+[a-zA-Z0-9_]+)*\\s*\\([^\\)]+\\)`

      // Single word mentions: @all, @team, etc.
      const singleWord = `@[a-zA-Z0-9_]+`

      const patterns = [knownPattern, withParentheses, capitalizedMultiWord, singleWord].filter(Boolean)

      return new RegExp(`(${patterns.join('|')})`, 'gi')
    }
  }, [mentionTargets])

  useEffect(() => {
    const closeMenu = () => {
      setContextMenu(null)
      setReactionMenuMsgId(null)
      setMentionMenuOpen(false)
    }
    window.addEventListener('click', closeMenu)
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeMenu()
    })
    return () => {
      window.removeEventListener('click', closeMenu)
    }
  }, [])

  const handleContextMenu = (e, msg) => {
    e.preventDefault()
    e.stopPropagation()
    // Clamp coordinates so menu stays visible inside viewport
    const menuWidth = 190
    const menuHeight = 120
    const x = Math.min(e.clientX, window.innerWidth - menuWidth - 10)
    const y = Math.min(e.clientY, window.innerHeight - menuHeight - 10)
    setContextMenu({ x, y, message: msg })
    setReactionMenuMsgId(null)
  }

  const handleFileUpload = async (event) => {
    const files = Array.from(event.target.files || [])
    if (!files.length) return

    setUploading(true)
    try {
      const uploadedList = []
      for (const file of files) {
        if (file.size > 20 * 1024 * 1024) {
          showToast(`File "${file.name}" exceeds 20MB limit`, 'error')
          continue
        }
        const uploaded = await uploadChatspaceMedia(file, brandName)
        uploadedList.push(uploaded)
      }
      setAttachedFiles((prev) => [...prev, ...uploadedList])
      showToast(`${uploadedList.length} attachment${uploadedList.length === 1 ? '' : 's'} added`)
    } catch (err) {
      showToast(err.message || 'Failed to upload attachment', 'error')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const removeAttachment = (indexToRemove) => {
    setAttachedFiles((prev) => prev.filter((_, idx) => idx !== indexToRemove))
  }

  const handleInputChange = (e) => {
    const val = e.target.value
    setInputMessage(val)

    const cursorPos = e.target.selectionStart || val.length
    const textBeforeCursor = val.slice(0, cursorPos)
    const match = textBeforeCursor.match(/(?:^|\s)@([a-zA-Z0-9_\s]*)$/)

    if (match) {
      const query = match[1]
      if (!query.includes('\n') && query.length <= 25) {
        setMentionMenuOpen(true)
        setMentionQuery(query)
        setMentionCursorIndex(cursorPos - query.length - 1)
        setMentionSelectedIndex(0)
        return
      }
    }
    setMentionMenuOpen(false)
  }

  const insertMention = (target) => {
    if (!target) return
    const beforeAt = inputMessage.slice(0, mentionCursorIndex)
    const afterCursor = inputMessage.slice(inputRef.current?.selectionStart || inputMessage.length)
    const replacement = `@${target.handle} `
    const newText = `${beforeAt}${replacement}${afterCursor}`
    setInputMessage(newText)
    setMentionMenuOpen(false)

    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus()
        const newCursorPos = beforeAt.length + replacement.length
        inputRef.current.setSelectionRange(newCursorPos, newCursorPos)
      }
    }, 10)
  }

  const handleSend = async (e) => {
    e?.preventDefault()
    if ((!inputMessage.trim() && attachedFiles.length === 0) || sending) return

    const text = inputMessage
    const currentReply = replyingTo
    const mediaToSend = [...attachedFiles]

    // Extract any @mentions from the text using our comprehensive mention regex
    const mentionRegex = buildMentionRegex()
    const matches = text.match(mentionRegex) || []
    const mentionMatches = matches.map((m) => m.replace(/^@/, '').trim()).filter(Boolean)

    setInputMessage('')
    setReplyingTo(null)
    setAttachedFiles([])
    setSending(true)
    setMentionMenuOpen(false)

    try {
      const sent = await sendClientChatMessage({
        brandName,
        content: text,
        media: mediaToSend,
        mentions: mentionMatches,
        currentUser: user,
        replyTo: currentReply,
      })
      setJustSentId(sent.id)
      await loadMessages()
    } catch (err) {
      showToast(err.message || 'Failed to send message', 'error')
      setInputMessage(text)
      setReplyingTo(currentReply)
      setAttachedFiles(mediaToSend)
    } finally {
      setSending(false)
      setTimeout(() => {
        setJustSentId(null)
      }, 700)
      inputRef.current?.focus()
    }
  }

  const handleKeyDown = (e) => {
    if (mentionMenuOpen && filteredMentions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setMentionSelectedIndex((prev) => (prev + 1) % filteredMentions.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setMentionSelectedIndex((prev) => (prev - 1 + filteredMentions.length) % filteredMentions.length)
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        insertMention(filteredMentions[mentionSelectedIndex])
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setMentionMenuOpen(false)
        return
      }
    }

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

  const renderMessageContent = (content, fromClient, explicitMentions = []) => {
    if (!content) return null
    const mentionRegex = buildMentionRegex(explicitMentions)
    const parts = content.split(mentionRegex)

    return (
      <p className="whitespace-pre-wrap leading-relaxed">
        {parts.map((part, i) => {
          if (part && part.startsWith('@')) {
            return (
              <span
                key={i}
                className={`inline-flex items-center font-bold px-1.5 py-0.5 rounded text-xs mx-0.5 shadow-2xs ${
                  fromClient
                    ? 'bg-white/20 text-white border border-white/30'
                    : 'bg-purple/10 text-purple border border-purple/20'
                }`}
              >
                {part}
              </span>
            )
          }
          return part
        })}
      </p>
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
            <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-blue-500" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-extrabold text-ink tracking-tight">
                Chatspace
              </h2>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                {brandName}
              </span>
            </div>
            <p className="text-xs text-muted">
              Live updates, adjustments, and coordination directly with the Orb operations team
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
        </div>
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
              Start chatting with our team to request changes, tweaks, or updates for {brandName}.
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
                  <div
                    className="relative group/bubble"
                    onContextMenu={(e) => handleContextMenu(e, msg)}
                  >
                    <div
                      className={`cursor-context-menu select-text rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-2xs transition-all ${
                        fromClient
                          ? 'rounded-tr-xs bg-primary text-white selection:bg-white/20'
                          : 'rounded-tl-xs border border-slate-200/90 bg-white text-slate-800'
                      }`}
                    >
                      {renderMessageContent(msg.content, fromClient, msg.mentions)}

                      {/* Attached Media Grid */}
                      {Array.isArray(msg.media) && msg.media.length > 0 && (
                        <div className={`grid gap-2 ${msg.content ? 'mt-2.5' : ''} ${msg.media.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                          {msg.media.map((file, fIdx) => (
                            <div key={file.id || fIdx} className="overflow-hidden rounded-xl border border-black/10 bg-black/5">
                              {file.isImage || file.type?.startsWith('image/') ? (
                                <a
                                  href={file.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="block overflow-hidden group/img relative"
                                >
                                  <img
                                    src={file.url}
                                    alt={file.name || 'Attachment'}
                                    className="max-h-56 w-full object-cover transition-transform duration-200 group-hover/img:scale-105"
                                  />
                                </a>
                              ) : (
                                <a
                                  href={file.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  download={file.name}
                                  className="flex items-center gap-2.5 p-2.5 hover:bg-black/10 transition"
                                >
                                  <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/80 text-ink shadow-2xs">
                                    <FileText size={16} />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate text-xs font-bold leading-tight">{file.name}</p>
                                    <p className="text-[10px] opacity-70">
                                      {file.size ? `${(file.size / 1024).toFixed(1)} KB` : 'File'}
                                    </p>
                                  </div>
                                </a>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Integrated Quick Action Button on Hover (Clean & Accessible) */}
                    <div
                      className={`absolute -top-3.5 ${
                        fromClient ? 'left-2' : 'right-2'
                      } hidden group-hover/bubble:flex items-center gap-0.5 bg-white border border-slate-200 shadow-md rounded-full px-1.5 py-0.5 z-10 animate-in fade-in zoom-in-95`}
                    >
                      {/* React Button */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setReactionMenuMsgId(reactionMenuMsgId === msg.id ? null : msg.id)
                        }}
                        className="p-1 rounded-full text-slate-500 hover:bg-slate-100 hover:text-purple transition"
                        title="React with emoji"
                      >
                        <Smile size={13} />
                      </button>

                      {/* Quote Reply Button */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setReplyingTo(msg)
                          inputRef.current?.focus()
                        }}
                        className="p-1 rounded-full text-slate-500 hover:bg-slate-100 hover:text-purple transition"
                        title="Quote reply"
                      >
                        <CornerDownRight size={13} />
                      </button>
                    </div>

                    {/* Emoji Picker Popup */}
                    {reactionMenuMsgId === msg.id && (
                      <div
                        className={`absolute -top-11 flex items-center gap-1.5 bg-white border border-slate-200 shadow-lg rounded-full px-2.5 py-1 z-20 animate-in fade-in zoom-in-95 ${
                          fromClient ? 'right-0' : 'left-0'
                        }`}
                      >
                        {PRESET_REACTIONS.map((emoji) => (
                          <button
                            key={emoji}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleReact(msg.id, emoji)
                            }}
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
      <div className="border-t border-slate-200 bg-white p-4 relative">
        {/* Mention Suggestions Floating Popup */}
        {mentionMenuOpen && filteredMentions.length > 0 && (
          <div className="absolute bottom-full left-4 right-4 mb-2 z-30 max-h-56 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl animate-in fade-in zoom-in-95">
            <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 flex items-center justify-between">
              <span>Mention people or teams</span>
              <span>↑↓ to navigate • Enter to select</span>
            </div>
            <div className="mt-1 space-y-0.5">
              {filteredMentions.map((item, idx) => {
                const isSelected = idx === mentionSelectedIndex
                return (
                  <button
                    key={item.id}
                    type="button"
                    onMouseEnter={() => setMentionSelectedIndex(idx)}
                    onClick={() => insertMention(item)}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs transition ${
                      isSelected ? 'bg-purple/10 text-purple font-semibold' : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {item.avatar ? (
                      <img src={item.avatar} alt={item.handle} className="h-6 w-6 rounded-full object-cover shrink-0" />
                    ) : (
                      <span className="grid h-6 w-6 place-items-center rounded-lg bg-slate-100 text-xs shrink-0">
                        {item.icon || item.initials || '@'}
                      </span>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold">{item.label}</span>
                        {item.role && (
                          <span className="rounded bg-slate-100 px-1.5 py-0.2 text-[9px] font-bold text-slate-500">
                            {item.role}
                          </span>
                        )}
                      </div>
                      {item.description && (
                        <p className="truncate text-[10px] text-slate-400 font-normal">{item.description}</p>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Attachment preview bar if attachments exist */}
        {attachedFiles.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {attachedFiles.map((file, idx) => (
              <div
                key={file.id || idx}
                className="group relative flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2 pr-7 text-xs shadow-2xs"
              >
                {file.isImage || file.type?.startsWith('image/') ? (
                  <img
                    src={file.url}
                    alt={file.name}
                    className="h-8 w-8 rounded-lg object-cover border border-slate-200"
                  />
                ) : (
                  <div className="grid h-8 w-8 place-items-center rounded-lg bg-white text-slate-700 border border-slate-200">
                    <FileText size={16} />
                  </div>
                )}
                <div className="max-w-[140px] truncate">
                  <p className="truncate font-semibold text-slate-800">{file.name}</p>
                  <p className="text-[10px] text-slate-400">
                    {file.size ? `${(file.size / 1024).toFixed(1)} KB` : 'Attached'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => removeAttachment(idx)}
                  className="absolute right-1.5 top-2 rounded-full p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                  title="Remove attachment"
                >
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,application/pdf,.doc,.docx,.txt,.csv"
          onChange={handleFileUpload}
          className="hidden"
        />

        {/* Input box */}
        <form onSubmit={handleSend} className="relative flex items-end gap-2">
          {/* Attach file button */}
          <button
            type="button"
            disabled={uploading || sending}
            onClick={() => fileInputRef.current?.click()}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-2xs hover:border-purple/40 hover:bg-slate-50 hover:text-purple transition disabled:opacity-40"
            title="Attach image or document (Supabase Storage)"
            aria-label="Attach file"
          >
            {uploading ? <Loader2 size={18} className="animate-spin text-purple" /> : <Paperclip size={18} />}
          </button>

          <textarea
            ref={inputRef}
            rows={2}
            value={inputMessage}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={
              replyingTo
                ? `Type your reply to #${replyingTo.id.slice(0, 6)}...`
                : `Message our team about ${brandName}... (@ to mention, paste text, attach files)`
            }
            className="flex-1 resize-none rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-purple focus:outline-none focus:ring-2 focus:ring-purple/10"
          />

          <button
            type="submit"
            disabled={(!inputMessage.trim() && attachedFiles.length === 0) || sending || uploading}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-white shadow-sm transition hover:bg-primary-dark disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Send message"
          >
            <Send size={18} className={sending ? 'translate-x-1 opacity-50' : ''} />
          </button>
        </form>
        <div className="flex justify-between items-center mt-1.5 px-1 text-[11px] text-slate-400">
          <span>Type @ to mention teams or members • Press Enter to send • Files stored in Supabase</span>
          <span>Right-click any message to react or reply</span>
        </div>
      </div>

      {/* Right-Click Context Menu */}
      {contextMenu && (
        <div
          className="fixed z-50 min-w-[200px] overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl animate-in fade-in zoom-in-95"
          style={{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Reaction Quick Bar inside Context Menu */}
          <div className="flex items-center justify-between border-b border-slate-100 px-2 py-1.5 mb-1">
            <span className="text-[11px] font-bold text-slate-400">React:</span>
            <div className="flex items-center gap-1">
              {PRESET_REACTIONS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => {
                    handleReact(contextMenu.message.id, emoji)
                    setContextMenu(null)
                  }}
                  className="rounded-full p-1 text-base hover:scale-125 transition-transform hover:bg-slate-100"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          {/* Reply Option */}
          <button
            type="button"
            onClick={() => {
              setReplyingTo(contextMenu.message)
              setContextMenu(null)
              inputRef.current?.focus()
            }}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-semibold text-slate-700 hover:bg-purple/10 hover:text-purple transition"
          >
            <CornerDownRight size={14} className="text-purple" />
            <span>Reply to message</span>
          </button>

          {/* Copy Text Option */}
          <button
            type="button"
            onClick={() => {
              navigator.clipboard?.writeText(contextMenu.message.content)
              showToast('Copied to clipboard')
              setContextMenu(null)
            }}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition"
          >
            <Quote size={14} className="text-slate-400" />
            <span>Copy message</span>
          </button>
        </div>
      )}
    </div>
  )
}


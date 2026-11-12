import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronUp,
  CornerDownRight,
  FileText,
  Image as ImageIcon,
  Loader2,
  MessageSquare,
  Paperclip,
  Quote,
  Search,
  Send,
  Smile,
  X,
} from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
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
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchActiveIndex, setSearchActiveIndex] = useState(0)
  const [showScrollBottom, setShowScrollBottom] = useState(false)

  const fileInputRef = useRef(null)
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)
  const scrollContainerRef = useRef(null)
  const searchInputRef = useRef(null)
  const isFirstLoad = useRef(true)

  const handleScroll = () => {
    const el = scrollContainerRef.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    setShowScrollBottom(distanceFromBottom > 160)
  }

  const scrollToBottom = (smooth = true) => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        top: scrollContainerRef.current.scrollHeight,
        behavior: smooth ? 'smooth' : 'auto',
      })
    }
  }

  const loadMessages = async () => {
    try {
      const data = await getClientChatMessages(brandName, user)
      setMessages(data)
    } finally {
      setLoading(false)
    }
  }

  // Always show all messages — search just highlights & scrolls, never filters
  const displayedMessages = messages

  // Compute which message IDs match the current search query
  const searchMatchIds = useMemo(() => {
    const q = (searchQuery || '').trim().toLowerCase()
    if (!q) return []
    return messages
      .filter((m) => {
        const content = (m.content || '').toLowerCase()
        const senderName = (m.sender?.name || '').toLowerCase()
        const mediaMatch = Array.isArray(m.media) && m.media.some((f) => (f.name || '').toLowerCase().includes(q))
        return content.includes(q) || senderName.includes(q) || mediaMatch
      })
      .map((m) => m.id)
  }, [messages, searchQuery])

  // Reset active index when query or match list changes
  useEffect(() => { setSearchActiveIndex(0) }, [searchQuery, searchMatchIds.length])

  // Scroll to the active match
  useEffect(() => {
    if (!searchMatchIds.length) return
    const id = searchMatchIds[searchActiveIndex]
    if (!id) return
    const el = document.querySelector(`[data-msg-id="${id}"]`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [searchActiveIndex, searchMatchIds])

  const goToNextMatch = () => setSearchActiveIndex((i) => (i + 1) % searchMatchIds.length)
  const goToPrevMatch = () => setSearchActiveIndex((i) => (i - 1 + searchMatchIds.length) % searchMatchIds.length)

  useEffect(() => {
    if (!loading && messages.length > 0) {
      if (isFirstLoad.current) {
        scrollToBottom(false)
        isFirstLoad.current = false
      } else {
        const el = scrollContainerRef.current
        if (el) {
          const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
          if (distanceFromBottom < 220) {
            scrollToBottom(true)
          }
        }
      }
    }
  }, [messages.length, loading])

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

    // Always include current logged-in user in mention targets
    if (currentUserName && currentUserName !== 'You' && !seenNames.has(currentUserName.toLowerCase())) {
      seenNames.add(currentUserName.toLowerCase())
      list.push({
        id: `user-${currentUserName}`,
        handle: currentUserName,
        label: `@${currentUserName}`,
        role: user?.role === 'admin' ? 'Admin' : 'You',
        description: 'Mention yourself / account',
        avatar: user?.avatar,
        initials: currentUserName.slice(0, 2).toUpperCase(),
      })
    }

    messages.forEach((m) => {
      const name = m.sender?.name?.trim()
      if (name && !seenNames.has(name.toLowerCase()) && name !== 'You') {
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
      if (Array.isArray(m.mentions)) {
        m.mentions.forEach((mentionName) => {
          const clean = String(mentionName || '').trim()
          if (clean && !seenNames.has(clean.toLowerCase())) {
            seenNames.add(clean.toLowerCase())
            list.push({
              id: `mention-${clean}`,
              handle: clean,
              label: `@${clean}`,
              role: 'Member',
              description: `Mention ${clean}`,
              initials: clean.slice(0, 2).toUpperCase(),
            })
          }
        })
      }
    })

    return list
  }, [messages, currentUserName, user])

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

  // Build comprehensive mention regex supporting full names and preventing greedy word matching
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

      // Exact match for known multi-word & single-word handles up to word boundary
      const knownPattern = sortedKnown.length > 0 ? `@(?:${sortedKnown.join('|')})(?![\\w])` : ''

      // Names with parenthetical roles: @Name (Role) (e.g. @Sarah (Support Lead))
      const withParentheses = `@[a-zA-Z0-9_]+(?:\\s+[a-zA-Z0-9_]+)*\\s*\\([^\\)]+\\)`

      // Single word mentions: @all, @team, etc. (never crosses spaces)
      const singleWord = `@[a-zA-Z0-9_]+`

      const patterns = [knownPattern, withParentheses, singleWord].filter(Boolean)

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
      setTimeout(() => scrollToBottom(true), 40)
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
    const query = (searchQuery || '').trim()
    const queryRegex = query ? new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi') : null

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

          if (queryRegex && part) {
            const subParts = part.split(queryRegex)
            return (
              <React.Fragment key={i}>
                {subParts.map((sub, j) =>
                  sub.toLowerCase() === query.toLowerCase() ? (
                    <mark key={j} className="rounded-xs bg-amber-200/95 text-slate-900 px-0.5 font-bold shadow-2xs">
                      {sub}
                    </mark>
                  ) : (
                    sub
                  )
                )}
              </React.Fragment>
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
          {searchOpen ? (
            <div className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 shadow-2xs animate-in fade-in slide-in-from-right-3 duration-200">
              <Search size={14} className="text-slate-400 shrink-0" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') { setSearchOpen(false); setSearchQuery('') }
                  if (e.key === 'Enter') { if (e.shiftKey) goToPrevMatch(); else goToNextMatch() }
                }}
                placeholder="Search messages..."
                className="w-36 sm:w-52 bg-transparent text-xs text-slate-800 placeholder-slate-400 focus:outline-none"
                autoFocus
              />
              {searchQuery && searchMatchIds.length > 0 && (
                <span className="shrink-0 rounded bg-purple/10 px-1.5 py-0.5 text-[10px] font-bold text-purple">
                  {searchActiveIndex + 1}/{searchMatchIds.length}
                </span>
              )}
              {searchQuery && searchMatchIds.length === 0 && (
                <span className="shrink-0 text-[10px] font-bold text-slate-400">No matches</span>
              )}
              {searchQuery && searchMatchIds.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={goToPrevMatch}
                    className="rounded p-0.5 text-slate-500 hover:bg-slate-200 hover:text-slate-800 transition"
                    title="Previous match (Shift+Enter)"
                  >
                    <ChevronUp size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={goToNextMatch}
                    className="rounded p-0.5 text-slate-500 hover:bg-slate-200 hover:text-slate-800 transition"
                    title="Next match (Enter)"
                  >
                    <ChevronDown size={14} />
                  </button>
                </>
              )}
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="rounded p-0.5 text-slate-400 hover:text-slate-700 transition"
                  title="Clear"
                >
                  <X size={12} />
                </button>
              )}
              <button
                type="button"
                onClick={() => { setSearchOpen(false); setSearchQuery('') }}
                className="rounded p-0.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition"
                title="Close search (Esc)"
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                setSearchOpen(true)
                setTimeout(() => searchInputRef.current?.focus(), 50)
              }}
              className="flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 shadow-2xs hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 transition"
              title="Search conversation"
              aria-label="Search conversation"
            >
              <Search size={14} className="text-slate-400" />
              <span>Search</span>
            </button>
          )}
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="relative flex-1 overflow-y-auto p-6 space-y-5 bg-[#FBFBFC]"
      >
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <div className="flex items-center gap-2 text-sm text-muted">
              <Loader2 className="animate-spin text-purple" size={18} />
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
          <AnimatePresence initial={false}>
            {displayedMessages.map((msg, index) => {
              const fromClient = isClient(msg.sender)
              const isJustSent = msg.id === justSentId
              const reactions = msg.reactions || {}
              const myNameLower = (user?.name || user?.email?.split('@')[0] || '').toLowerCase()
              const myFirstName = myNameLower ? myNameLower.split(' ')[0] : ''
              const isMentionedToMe = !fromClient && (
                (Array.isArray(msg.mentions) && (
                  msg.mentions.some((m) => String(m).toLowerCase() === 'all' || String(m).toLowerCase() === 'team') ||
                  (myNameLower && msg.mentions.some((m) => myNameLower.includes(String(m).toLowerCase()) || String(m).toLowerCase().includes(myNameLower))) ||
                  (myFirstName && msg.mentions.some((m) => String(m).toLowerCase() === myFirstName))
                )) ||
                (msg.content && (
                  msg.content.toLowerCase().includes('@all') ||
                  msg.content.toLowerCase().includes('@team') ||
                  (myNameLower && msg.content.toLowerCase().includes(`@${myNameLower}`)) ||
                  (myFirstName && msg.content.toLowerCase().includes(`@${myFirstName}`))
                ))
              )

              return (
                <motion.div
                  key={msg.id || index}
                  data-msg-id={msg.id}
                  layout="position"
                  initial={{ opacity: 0, y: 16, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{
                    duration: 0.28,
                    ease: [0.16, 1, 0.3, 1],
                  }}
                  className={`group relative flex gap-3.5 transition-all duration-300 ease-out ${
                    fromClient ? 'flex-row-reverse justify-start' : 'flex-row justify-start'
                  } ${isJustSent ? 'translate-y-2 opacity-90 scale-[0.99]' : 'translate-y-0 opacity-100 scale-100'} ${
                    searchMatchIds.includes(msg.id)
                      ? searchMatchIds[searchActiveIndex] === msg.id
                        ? 'ring-2 ring-amber-400 ring-offset-2 rounded-2xl'
                        : 'ring-1 ring-amber-200 ring-offset-1 rounded-2xl'
                      : ''
                  }`}
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
                    {isMentionedToMe && (
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-blue-100 px-2 py-0.5 text-[9px] font-extrabold text-blue-700 border border-blue-200">
                        <span>@</span> Mentioned you
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
                          : isMentionedToMe
                          ? 'rounded-tl-xs border-2 border-blue-400 bg-blue-50/50 text-slate-900 ring-2 ring-blue-100'
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
              </motion.div>
            )
          })}
        </AnimatePresence>
        )}
        <div ref={messagesEndRef} />

        {/* Scroll To Bottom Floating Button */}
        {showScrollBottom && (
          <button
            type="button"
            onClick={() => scrollToBottom(true)}
            className="sticky bottom-4 float-right z-20 flex h-10 w-10 items-center justify-center rounded-full border-2 border-ink bg-white text-ink shadow-brutal hover:bg-slate-50 hover:text-purple hover:scale-105 transition-all duration-200 animate-in fade-in zoom-in-90"
            title="Scroll to bottom"
            aria-label="Scroll to bottom"
          >
            <ArrowDown size={18} />
          </button>
        )}
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


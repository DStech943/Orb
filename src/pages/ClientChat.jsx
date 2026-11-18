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
  Mic,
  MicOff,
  Plus,
  Quote,
  Search,
  Smile,
  Video,
  X,
} from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import Avatar from '../components/ui/Avatar'
import ChatReferenceCommands, { ChatReferenceCapsules } from '../components/chat/ChatReferences'
import { activeBrandId, activeBrandName } from '../services/orbApi'
import { startBrowserDictation } from '../lib/browserDictation'
import {
  PRESET_REACTIONS,
  getClientChatMessages,
  listBrandChatMembers,
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

const SLASH_COMMAND_IDS = ['products', 'oos', 'nos', 'flows', 'operation', 'template', 'sheet']
const chatspaceScrollMemory = new Map()
const referenceKey = (reference = {}) => `${reference.type || 'reference'}:${reference.id || reference.title || 'item'}`
// Keep a small reference snapshot in the text token as well as the JSONB
// column. The JSONB column is the canonical source, but this means a rich
// capsule still survives a delayed schema refresh or an older WebSocket
// worker that writes the message without `message_references`.
const referenceToken = (reference = {}) => {
  const snapshot = {
    type: reference.type || 'reference',
    id: reference.id || reference.title || 'item',
    title: reference.title || reference.name || 'Reference',
    subtitle: reference.subtitle || '',
    image: reference.image || '',
    href: reference.href || '',
    external: Boolean(reference.external),
  }
  return `[[orb-reference-v2:${encodeURIComponent(JSON.stringify(snapshot))}]]`
}
const referenceTokenPattern = /\[\[(?:orb-reference:([^:\]]+):([^\]]+)|orb-reference-v2:([^\]]+))\]\]/g
const fallbackReference = (type, id) => ({
  type: type || 'reference',
  id: id || 'item',
  title: type === 'product' ? 'Product' : type === 'flow' ? 'Flow' : type === 'template' ? 'Template' : type === 'operation' ? 'Operation' : type === 'sheet' ? 'Master sheet' : 'Reference',
  subtitle: '',
})
const escapeComposerHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;')
const composerTextHtml = (value) => escapeComposerHtml(value).replace(/\n/g, '<br>')
const composerReferenceHtml = (reference) => {
  const key = referenceKey(reference)
  const title = String(reference.title || reference.name || 'Reference').trim()
  const subtitle = String(reference.subtitle || '').trim()
  const image = String(reference.image || '').trim()
  const safeImage = /^https?:\/\//i.test(image) ? image : ''
  return `<span data-reference-key="${escapeComposerHtml(key)}" contenteditable="false" class="mx-0.5 inline-flex max-w-[13rem] select-none items-center gap-1.5 rounded-full border border-primary/20 bg-white px-1.5 py-1 align-middle text-xs font-bold text-slate-800 shadow-sm">${safeImage ? `<img src="${escapeComposerHtml(safeImage)}" alt="" class="h-4 w-4 shrink-0 rounded object-cover">` : ''}<span class="min-w-0 truncate">${escapeComposerHtml(title)}</span>${subtitle ? `<span class="shrink-0 text-[10px] font-medium text-slate-500">${escapeComposerHtml(subtitle)}</span>` : ''}<button type="button" tabindex="-1" data-remove-reference="${escapeComposerHtml(key)}" contenteditable="false" aria-label="Remove ${escapeComposerHtml(title)}" class="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-slate-600 text-[11px] leading-none text-white hover:bg-slate-800">×</button></span>`
}
const serializeRichMessage = (text, references = []) => {
  const value = String(text || '')
  const orderedReferences = [...references]
    .map((reference, index) => ({ reference, index, position: Number.isFinite(reference.position) ? reference.position : 0 }))
    .sort((left, right) => left.position - right.position || left.index - right.index)
  let output = ''
  let cursor = 0
  orderedReferences.forEach(({ reference, position }) => {
    const insertionPoint = Math.max(cursor, Math.min(value.length, position))
    output += value.slice(cursor, insertionPoint)
    output += referenceToken(reference)
    cursor = insertionPoint
  })
  return `${output}${value.slice(cursor)}`
}
const saveChatspaceScroll = (key, element) => {
  if (!element || !Number.isFinite(element.scrollTop)) return
  chatspaceScrollMemory.set(key, element.scrollTop)
  try { window.sessionStorage.setItem(key, String(element.scrollTop)) } catch {}
}

export default function ClientChat() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const brandName = activeBrandName() || 'Your Brand'
  const currentUserName = user?.name || user?.email?.split('@')[0] || 'You'

  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [inputMessage, setInputMessage] = useState('')
  const [selectedReferences, setSelectedReferences] = useState([])
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
  const [mediaPanelOpen, setMediaPanelOpen] = useState(false)
  const [mediaFilter, setMediaFilter] = useState('all')
  const [dictating, setDictating] = useState(false)
  const [dictationError, setDictationError] = useState('')
  const [slashCommandIndex, setSlashCommandIndex] = useState(0)
  const [composerRevision, setComposerRevision] = useState(0)
  const [assignedMembers, setAssignedMembers] = useState([])

  const fileInputRef = useRef(null)
  const slashMenuRef = useRef(null)
  const mentionOptionRefs = useRef([])
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)
  const inputMessageRef = useRef('')
  const composerCursorRef = useRef(0)
  const dictationRef = useRef(null)
  const scrollContainerRef = useRef(null)
  const searchInputRef = useRef(null)
  const isFirstLoad = useRef(true)
  const restoredScrollTopRef = useRef(null)
  const chatScrollStorageKey = `orb:chatspace-scroll:${encodeURIComponent(brandName)}`

  useEffect(() => { inputMessageRef.current = inputMessage }, [inputMessage])
  useEffect(() => { setSlashCommandIndex(0) }, [inputMessage])
  useEffect(() => () => { dictationRef.current?.stop() }, [])

  const readComposerState = (root) => {
    let text = ''
    const positions = new Map()
    const walk = (node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        text += node.nodeValue || ''
        return
      }
      if (node.nodeType !== Node.ELEMENT_NODE && node.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return
      const element = node.nodeType === Node.ELEMENT_NODE ? node : null
      const referenceKeyValue = element?.dataset?.referenceKey
      if (referenceKeyValue) {
        positions.set(referenceKeyValue, text.length)
        return
      }
      if (element?.tagName === 'BR') {
        text += '\n'
        return
      }
      const isBlock = element && ['DIV', 'P'].includes(element.tagName)
      if (isBlock && text && !text.endsWith('\n')) text += '\n'
      Array.from(node.childNodes).forEach(walk)
      if (isBlock && text && !text.endsWith('\n')) text += '\n'
    }
    Array.from(root?.childNodes || []).forEach(walk)
    return { text, positions }
  }

  const composerCursorPosition = () => {
    const root = inputRef.current
    const selection = window.getSelection()
    if (!root || !selection?.rangeCount || !root.contains(selection.anchorNode)) return inputMessage.length
    const range = selection.getRangeAt(0).cloneRange()
    range.selectNodeContents(root)
    range.setEnd(selection.anchorNode, selection.anchorOffset)
    return readComposerState(range.cloneContents()).text.length
  }

  const setComposerCaret = (position) => {
    const root = inputRef.current
    if (!root) return
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => node.parentElement?.closest('[data-reference-key]')
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT,
    })
    let remaining = Math.max(0, position)
    let node = walker.nextNode()
    while (node) {
      const length = node.nodeValue?.length || 0
      if (remaining <= length) {
        const range = document.createRange()
        range.setStart(node, remaining)
        range.collapse(true)
        const selection = window.getSelection()
        selection?.removeAllRanges()
        selection?.addRange(range)
        return
      }
      remaining -= length
      node = walker.nextNode()
    }
    const range = document.createRange()
    range.selectNodeContents(root)
    range.collapse(false)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
  }

  const replaceComposerText = (nextText, cursorPosition = nextText.length) => {
    setInputMessage(nextText)
    // Contenteditable owns its DOM between keystrokes. A keyed refresh is
    // needed for programmatic edits such as `/pr` → `/products `.
    setComposerRevision((revision) => revision + 1)
    window.setTimeout(() => {
      inputRef.current?.focus()
      composerCursorRef.current = cursorPosition
      setComposerCaret(cursorPosition)
    }, 0)
  }

  const startDictation = useCallback(() => {
    if (sending) return
    if (dictationRef.current) {
      dictationRef.current.stop()
      return
    }
    const base = inputMessageRef.current.trim()
    setDictationError('')
    setDictating(true)
    const session = startBrowserDictation({
      onTranscript: (transcript) => {
        const nextMessage = [base, transcript].filter(Boolean).join(base && transcript ? ' ' : '')
        inputMessageRef.current = nextMessage
        setInputMessage(nextMessage)
        setComposerRevision((revision) => revision + 1)
        window.setTimeout(() => inputRef.current?.focus(), 0)
      },
      onError: (error) => setDictationError(error === 'unsupported'
        ? 'Speech-to-text is not supported in this browser.'
        : error === 'not-allowed' || error === 'service-not-allowed'
          ? 'Allow microphone access to dictate a message.'
          : 'Could not start speech-to-text.'),
      onEnd: () => { dictationRef.current = null; setDictating(false) },
    })
    if (session) dictationRef.current = session
  }, [sending])

  const handleScroll = () => {
    const el = scrollContainerRef.current
    if (!el) return
    saveChatspaceScroll(chatScrollStorageKey, el)
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
      setMessages((current) => {
        const currentById = new Map(current.map((message) => [message.id, message]))
        const merged = data.map((message) => {
          const local = currentById.get(message.id)
          // A Supabase read can arrive before its reference column is visible
          // (or before an older WebSocket service is deployed). Retain the
          // locally-sent capsule rather than replacing it with an empty row.
          if ((!message.references || !message.references.length) && local?.references?.length) {
            return { ...message, references: local.references }
          }
          return message
        })
        const fetchedIds = new Set(merged.map((message) => message.id))
        current.forEach((message) => {
          if (!fetchedIds.has(message.id) && message.references?.length) merged.push(message)
        })
        return merged.sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0))
      })
    } finally {
      setLoading(false)
    }
  }

  // Always show all messages — search just highlights & scrolls, never filters
  const displayedMessages = messages

  const sharedMedia = useMemo(() => messages.flatMap((message) => (Array.isArray(message.media) ? message.media : []).map((file, index) => ({
    ...file,
    key: `${message.id}-${file.id || index}`,
    messageId: message.id,
    senderName: message.sender?.name || 'Unknown sender',
    createdAt: message.createdAt,
  }))), [messages])

  const mediaItems = useMemo(() => sharedMedia.filter((file) => {
    const type = String(file.type || '').toLowerCase()
    const isImage = Boolean(file.isImage || type.startsWith('image/'))
    const isVideo = type.startsWith('video/')
    return mediaFilter === 'all' || (mediaFilter === 'images' && isImage) || (mediaFilter === 'videos' && isVideo) || (mediaFilter === 'files' && !isImage && !isVideo)
  }), [mediaFilter, sharedMedia])

  const jumpToMessage = useCallback((messageId) => {
    const target = document.querySelector(`[data-msg-id="${messageId}"]`)
    if (!target) return
    target.scrollIntoView({ behavior: 'smooth', block: 'center' })
    target.classList.add('ring-2', 'ring-purple/50', 'rounded-2xl')
    window.setTimeout(() => target.classList.remove('ring-2', 'ring-purple/50', 'rounded-2xl'), 1200)
  }, [])

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
        const savedScrollTop = restoredScrollTopRef.current
        if (Number.isFinite(savedScrollTop)) {
          // Flow/message animations can briefly reset the container after the
          // first paint. Restore through that settling window as well.
          ;[0, 90, 280].forEach((delay) => window.setTimeout(() => {
            const el = scrollContainerRef.current
            if (!el) return
            el.scrollTop = Math.min(savedScrollTop, Math.max(0, el.scrollHeight - el.clientHeight))
            handleScroll()
          }, delay))
        } else {
          scrollToBottom(false)
        }
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
    try {
      const stored = chatspaceScrollMemory.has(chatScrollStorageKey)
        ? String(chatspaceScrollMemory.get(chatScrollStorageKey))
        : window.sessionStorage.getItem(chatScrollStorageKey)
      const parsed = stored === null ? null : Number(stored)
      restoredScrollTopRef.current = Number.isFinite(parsed) ? parsed : null
    } catch {
      restoredScrollTopRef.current = null
    }
    isFirstLoad.current = true
    return () => {
      saveChatspaceScroll(chatScrollStorageKey, scrollContainerRef.current)
    }
  }, [chatScrollStorageKey])

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

  useEffect(() => {
    let live = true
    const loadAssignedMembers = async () => {
      try {
        const members = await listBrandChatMembers(activeBrandId())
        if (live) setAssignedMembers(members)
      } catch {
        if (live) setAssignedMembers([])
      }
    }
    loadAssignedMembers()
    window.addEventListener('orb:brand-changed', loadAssignedMembers)
    return () => {
      live = false
      window.removeEventListener('orb:brand-changed', loadAssignedMembers)
    }
  }, [brandName])

  // Individual mentions come only from the active brand's assignments. This
  // avoids exposing people from another brand through prior chat history.
  const mentionTargets = useMemo(() => {
    const list = [...PRESET_MENTIONS.slice(0, 2)]
    const seenNames = new Set(list.map((item) => item.handle.toLowerCase()))
    assignedMembers.forEach((member) => {
      const name = String(member.handle || '').trim()
      if (!name || seenNames.has(name.toLowerCase())) return
      seenNames.add(name.toLowerCase())
      list.push(member)
    })
    return list
  }, [assignedMembers])

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

  // Keep the keyboard-selected mention in view as the user moves through a
  // longer list. The active row is still selected even when it falls below
  // the popup's viewport, so this is deliberately tied to its index.
  useEffect(() => {
    if (!mentionMenuOpen || !filteredMentions.length) return
    mentionOptionRefs.current[mentionSelectedIndex]?.scrollIntoView({ block: 'nearest' })
  }, [filteredMentions.length, mentionMenuOpen, mentionSelectedIndex])

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

  const chooseReference = (kind, item) => {
    if (kind === 'command') {
      const nextText = item
        ? inputMessage.replace(/\/\w*$/, `/${item} `)
        : inputMessage.replace(/(?:^|\s)\/\w*(?:\s+.*)?$/, '')
      replaceComposerText(nextText)
      return
    }
    const slashIndex = inputMessage.lastIndexOf('/')
    const messageBeforeCommand = slashIndex >= 0 ? inputMessage.slice(0, slashIndex) : inputMessage
    const insertionPosition = messageBeforeCommand.length
    const next = item.type === 'product-set'
      ? item.products.map((product) => ({ type: 'product', id: product.id, title: product.name, subtitle: `${item.id === 'oos' ? 'Out of stock' : `${(product.variants || []).map((variant) => Number(variant.inventoryQuantity) || 0).reduce((total, quantity) => total + quantity, 0)} in stock`}`, image: product.featuredImage?.url || '', href: product.url || '/app/products', external: Boolean(product.url) }))
      : [item]
    setSelectedReferences((current) => [...current, ...next
      .filter((reference) => !current.some((existing) => existing.type === reference.type && existing.id === reference.id))
      .map((reference) => ({ ...reference, position: insertionPosition }))])
    setInputMessage(messageBeforeCommand)
    setComposerRevision((revision) => revision + 1)
    window.setTimeout(() => {
      inputRef.current?.focus()
      // The chosen capsule is rendered at the command location; continue
      // typing immediately after it rather than in a separate field.
      setComposerCaret(Number.MAX_SAFE_INTEGER)
    }, 0)
  }

  const handleInputChange = (e) => {
    const { text: val, positions } = readComposerState(e.currentTarget)
    const cursorPos = composerCursorPosition()
    composerCursorRef.current = cursorPos
    setSelectedReferences((current) => current
      .filter((reference) => positions.has(referenceKey(reference)))
      .map((reference) => ({ ...reference, position: positions.get(referenceKey(reference)) })))
    setInputMessage(val)

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
    const cursorPosition = composerCursorRef.current || inputMessage.length
    const afterCursor = inputMessage.slice(cursorPosition)
    const replacement = `@${target.handle} `
    const newText = `${beforeAt}${replacement}${afterCursor}`
    setSelectedReferences((current) => current.map((reference) => (
      Number.isFinite(reference.position) && reference.position > cursorPosition
        ? { ...reference, position: reference.position + replacement.length }
        : reference
    )))
    setInputMessage(newText)
    setComposerRevision((revision) => revision + 1)
    setMentionMenuOpen(false)

    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus()
        const newCursorPos = beforeAt.length + replacement.length
        composerCursorRef.current = newCursorPos
        setComposerCaret(newCursorPos)
      }
    }, 10)
  }

  const handleSend = async (e) => {
    e?.preventDefault()
    if ((!inputMessage.trim() && attachedFiles.length === 0 && selectedReferences.length === 0) || sending) return

    const enteredText = inputMessage
    const currentReply = replyingTo
    const mediaToSend = [...attachedFiles]
    const referencesToSend = [...selectedReferences]
    const text = serializeRichMessage(enteredText, referencesToSend)

    // Extract any @mentions from the text using our comprehensive mention regex
    const mentionRegex = buildMentionRegex()
    const matches = text.match(mentionRegex) || []
    const mentionMatches = matches.map((m) => m.replace(/^@/, '').trim()).filter(Boolean)

    setInputMessage('')
    setComposerRevision((revision) => revision + 1)
    setReplyingTo(null)
    setAttachedFiles([])
    setSelectedReferences([])
    setSending(true)
    setMentionMenuOpen(false)

    try {
      const sent = await sendClientChatMessage({
        brandName,
        content: text,
        media: mediaToSend,
        references: referencesToSend,
        mentions: mentionMatches,
        currentUser: user,
        replyTo: currentReply,
      })
      setJustSentId(sent.id)
      setMessages((current) => current.some((message) => message.id === sent.id) ? current : [...current, sent])
      await loadMessages()
      setTimeout(() => scrollToBottom(true), 40)
    } catch (err) {
      showToast(err.message || 'Failed to send message', 'error')
      setInputMessage(enteredText)
      setComposerRevision((revision) => revision + 1)
      setReplyingTo(currentReply)
      setAttachedFiles(mediaToSend)
      setSelectedReferences(referencesToSend)
    } finally {
      setSending(false)
      setTimeout(() => {
        setJustSentId(null)
      }, 700)
      inputRef.current?.focus()
    }
  }

  const handleKeyDown = (e) => {
    // Own the top-level command list here, so keyboard navigation works even
    // before React has mounted the suggestion menu on the first `/` press.
    const partialSlash = inputMessage.match(/(?:^|\s)\/(\w*)$/)?.[1]?.toLowerCase()
    if (partialSlash !== undefined) {
      const commands = SLASH_COMMAND_IDS.filter((command) => command.startsWith(partialSlash))
      if (commands.length && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        e.preventDefault()
        setSlashCommandIndex((current) => e.key === 'ArrowDown' ? (current + 1) % commands.length : (current - 1 + commands.length) % commands.length)
        return
      }
      if (commands.length && (e.key === 'Enter' || e.key === 'Tab')) {
        e.preventDefault()
        const selectedCommand = commands[slashCommandIndex % commands.length]
        replaceComposerText(inputMessage.replace(/\/\w*$/, `/${selectedCommand} `))
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        replaceComposerText(inputMessage.replace(/(?:^|\s)\/\w*$/, ''))
        return
      }
    }
    if (slashMenuRef.current?.handleKeyDown(e.key)) {
      e.preventDefault()
      return
    }
    // Never let an in-progress slash command fall through to the form submit
    // while its picker is mounting or loading its options.
    if (/(?:^|\s)\/\w*(?:\s.*)?$/.test(inputMessage) && ['Enter', 'Tab', 'ArrowDown', 'ArrowUp', 'Escape'].includes(e.key)) {
      e.preventDefault()
      return
    }
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

  const isCurrentUser = (sender) => Boolean(user?.id && sender?.id === user.id)

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

  const renderMessageContent = (content, fromClient, explicitMentions = [], inline = false) => {
    if (!content) return null
    const mentionRegex = buildMentionRegex(explicitMentions)
    const parts = content.split(mentionRegex)
    const query = (searchQuery || '').trim()
    const queryRegex = query ? new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi') : null

    const TextElement = inline ? 'span' : 'p'
    return (
      <TextElement className="whitespace-pre-wrap leading-relaxed">
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
      </TextElement>
    )
  }

  // References are saved as lightweight tokens within the message string, not
  // as a second attachment layer. This preserves the writer's exact order:
  // “text, capsule, more text” remains that way after sending and reloading.
  const renderRichMessageContent = (content, references, fromClient, explicitMentions = []) => {
    const storedReferences = Array.isArray(references) ? references : []
    // Repair rows saved during the short compatibility window that appended a
    // visible "(Shared: …)" copy after the real reference.
    const sharedTitles = storedReferences.map((reference) => String(reference.title || '').trim()).filter(Boolean).join(', ')
    const sharedSuffix = sharedTitles ? ` (Shared: ${sharedTitles})` : ''
    const rawValue = String(content || '')
    const legacyShared = !storedReferences.length && rawValue.match(/(?:^|\s)\(?Shared:\s*([^\)]+)\)?\s*$/i)
    const recoveredReferences = legacyShared?.[1]?.trim()
      ? [{ type: 'reference', id: `legacy-${legacyShared[1].trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, title: legacyShared[1].trim(), subtitle: 'Shared reference' }]
      : []
    const availableReferences = storedReferences.length ? storedReferences : recoveredReferences
    const value = sharedSuffix && rawValue.endsWith(sharedSuffix)
      ? rawValue.slice(0, -sharedSuffix.length)
      : legacyShared
        ? rawValue.slice(0, legacyShared.index).trimEnd()
      : rawValue
    const referencesByKey = new Map(availableReferences.map((reference) => [referenceKey(reference), reference]))
    const consumed = new Set()
    const parts = []
    let cursor = 0
    let match

    referenceTokenPattern.lastIndex = 0
    while ((match = referenceTokenPattern.exec(value))) {
      if (match.index > cursor) {
        parts.push(
          <React.Fragment key={`text-${cursor}`}>
            {renderMessageContent(value.slice(cursor, match.index), fromClient, explicitMentions, true)}
          </React.Fragment>,
        )
      }

      let type = ''
      let id = ''
      let tokenReference = null
      try {
        if (match[3]) {
          tokenReference = JSON.parse(decodeURIComponent(match[3]))
          type = String(tokenReference?.type || '')
          id = String(tokenReference?.id || '')
        } else {
          type = decodeURIComponent(match[1])
          id = decodeURIComponent(match[2])
        }
      } catch {
        // A malformed token receives a neutral capsule rather than exposing
        // the internal storage marker to people in Chatspace.
      }
      const reference = referencesByKey.get(`${type}:${id}`) || tokenReference || fallbackReference(type, id)
      if (reference) {
        consumed.add(referenceKey(reference))
        parts.push(
          <ChatReferenceCapsules
            key={`reference-${match.index}`}
            references={[reference]}
            tone={fromClient ? 'dark' : 'light'}
            inline
            className="mt-0"
          />,
        )
      }
      cursor = referenceTokenPattern.lastIndex
    }

    if (cursor < value.length) {
      parts.push(
        <React.Fragment key={`text-${cursor}`}>
          {renderMessageContent(value.slice(cursor), fromClient, explicitMentions, true)}
        </React.Fragment>,
      )
    }

    // Existing messages created before ordered tokens were introduced still
    // display their capsules safely. New messages never take this path.
    const legacyReferences = availableReferences.filter((reference) => !consumed.has(referenceKey(reference)))
    if (legacyReferences.length) {
      parts.push(
        <ChatReferenceCapsules
          key="legacy-references"
          references={legacyReferences}
          tone={fromClient ? 'dark' : 'light'}
          inline
          className="mt-0"
        />,
      )
    }

    return parts.length ? parts : null
  }

  // Native contenteditable owns its DOM while a person is typing. React only
  // rebuilds it after a deliberate programmatic edit, preventing duplicated
  // capsules, reversed text, and cursor jumps.
  const composerHtml = useMemo(() => {
    const orderedReferences = [...selectedReferences]
      .map((reference, index) => ({ reference, index, position: Number.isFinite(reference.position) ? reference.position : 0 }))
      .sort((left, right) => left.position - right.position || left.index - right.index)
    const parts = []
    let cursor = 0

    orderedReferences.forEach(({ reference, position }) => {
      const insertionPoint = Math.max(cursor, Math.min(inputMessage.length, position))
      if (insertionPoint > cursor) {
        parts.push(composerTextHtml(inputMessage.slice(cursor, insertionPoint)))
      }
      parts.push(composerReferenceHtml(reference))
      cursor = insertionPoint
    })
    if (cursor < inputMessage.length) {
      parts.push(composerTextHtml(inputMessage.slice(cursor)))
    }
    return parts.join('')
    // composerRevision is the intentional DOM refresh boundary.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [composerRevision])

  const removeComposerReference = (event) => {
    const button = event.target instanceof Element ? event.target.closest('[data-remove-reference]') : null
    const key = button?.getAttribute('data-remove-reference')
    if (!key) return
    event.preventDefault()
    setSelectedReferences((current) => current.filter((reference) => referenceKey(reference) !== key))
    setComposerRevision((revision) => revision + 1)
    window.setTimeout(() => inputRef.current?.focus(), 0)
  }

  return (
    <div className="relative mx-auto flex h-[calc(100vh-100px)] max-w-5xl flex-col rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
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
            <button type="button" onClick={() => setMediaPanelOpen((open) => !open)} aria-expanded={mediaPanelOpen} aria-controls="chatspace-media-panel" className="mt-0.5 inline-flex items-center gap-1 text-xs font-semibold text-muted transition hover:text-purple">
              <ImageIcon size={13} /> Media {sharedMedia.length ? `(${sharedMedia.length})` : ''}
            </button>
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

      {mediaPanelOpen && (
        <aside id="chatspace-media-panel" aria-label="Shared media" className="absolute inset-y-[76px] right-0 z-30 flex w-[min(20rem,90vw)] flex-col border-l border-slate-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div><h3 className="text-sm font-extrabold text-ink">Media</h3><p className="text-[11px] text-muted">Jump to any shared attachment.</p></div>
            <button type="button" onClick={() => setMediaPanelOpen(false)} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close media panel"><X size={17} /></button>
          </div>
          <div className="grid grid-cols-4 gap-1 border-b border-slate-100 p-2" role="tablist" aria-label="Media type">
            {[
              ['all', 'All', Paperclip],
              ['images', 'Images', ImageIcon],
              ['videos', 'Videos', Video],
              ['files', 'Files', FileText],
            ].map(([value, label, Icon]) => <button key={value} type="button" role="tab" aria-selected={mediaFilter === value} onClick={() => setMediaFilter(value)} className={`flex flex-col items-center gap-1 rounded-lg px-1 py-2 text-[10px] font-bold transition ${mediaFilter === value ? 'bg-purple text-white' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'}`}><Icon size={14} />{label}</button>)}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {mediaItems.length ? <div className="grid gap-2">{mediaItems.map((file) => {
              const type = String(file.type || '').toLowerCase()
              const isImage = Boolean(file.isImage || type.startsWith('image/'))
              const isVideo = type.startsWith('video/')
              return <button key={file.key} type="button" onClick={() => jumpToMessage(file.messageId)} className="group flex w-full items-center gap-2 rounded-lg border border-slate-200 bg-white p-2 text-left transition hover:border-purple/40 hover:bg-purple/5">
                <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-md bg-slate-100 text-slate-400">{isImage ? <img src={file.url} alt="" className="h-full w-full object-cover" /> : isVideo ? <Video size={19} /> : <FileText size={19} />}</div>
                <div className="min-w-0 flex-1"><p className="truncate text-xs font-bold text-slate-700">{file.name || (isImage ? 'Image' : isVideo ? 'Video' : 'File')}</p><p className="mt-0.5 truncate text-[10px] text-slate-400">{file.senderName} · {formatTime(file.createdAt)}</p></div>
              </button>
            })}</div> : <div className="grid min-h-40 place-items-center text-center"><div><ImageIcon className="mx-auto text-slate-300" size={26} /><p className="mt-2 text-xs font-bold text-slate-600">No {mediaFilter === 'all' ? 'media' : mediaFilter} shared yet</p></div></div>}
          </div>
        </aside>
      )}

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
              const fromClient = isCurrentUser(msg.sender)
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
                  className={`group relative flex items-start gap-3.5 transition-all duration-300 ease-out ${
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
                <div className="shrink-0 pt-6">
                  <Avatar name={msg.sender.name} src={msg.sender.avatar} sources={msg.sender.avatarSources} className="rounded-full border border-slate-200 shadow-2xs" fallbackClassName={fromClient ? 'bg-purple border-purple/80' : 'bg-slate-800 border-slate-700'} />
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
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        const target = document.querySelector(`[data-msg-id="${msg.replyToId}"]`)
                        if (target) {
                          target.scrollIntoView({ behavior: 'smooth', block: 'center' })
                          target.classList.add('ring-2', 'ring-purple/50', 'rounded-2xl')
                          setTimeout(() => target.classList.remove('ring-2', 'ring-purple/50', 'rounded-2xl'), 1200)
                        }
                      }}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') e.currentTarget.click() }}
                      className={`flex cursor-pointer items-center gap-1.5 mb-1.5 rounded-lg px-2.5 py-1 text-[11px] border border-slate-200/80 bg-slate-100/80 text-slate-600 max-w-full truncate hover:bg-slate-200/70 hover:border-slate-300 transition-colors ${
                        fromClient ? 'rounded-tr-xs' : 'rounded-tl-xs'
                      }`}
                      title="Click to jump to original message"
                    >
                      <Quote size={11} className="text-purple shrink-0" />
                      <span className="font-semibold text-slate-500 shrink-0">Replying:</span>
                      <span className="truncate italic">"{msg.replyToSnippet}"</span>
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
                      <div className="flex flex-wrap items-center gap-1.5">
                        {renderRichMessageContent(msg.content, msg.references, fromClient, msg.mentions)}
                      </div>

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
              Replying to {isCurrentUser(replyingTo.sender) ? 'yourself' : replyingTo.sender.name}:
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
                    ref={(node) => { mentionOptionRefs.current[idx] = node }}
                    type="button"
                    aria-selected={isSelected}
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
        <form onSubmit={handleSend} className="relative">
          <ChatReferenceCommands ref={slashMenuRef} value={inputMessage} brandName={brandName} role={user?.role} commandSelectedIndex={slashCommandIndex} onChoose={chooseReference} />
          <div className="rounded-2xl border border-[#bdc6ff] bg-[#eef0ff] p-2 shadow-sm transition focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/10">
            <div className="px-1">
              <div
                key={composerRevision}
                ref={inputRef}
                contentEditable
                suppressContentEditableWarning
                role="textbox"
                aria-multiline="true"
                aria-label={replyingTo ? `Type your reply to #${replyingTo.id.slice(0, 6)}` : `Message our team about ${brandName}`}
                onInput={handleInputChange}
                onKeyDown={handleKeyDown}
                onClick={removeComposerReference}
                onFocus={() => { composerCursorRef.current = composerCursorPosition() }}
                className="min-h-[32px] w-full whitespace-pre-wrap break-words bg-transparent px-1 py-1.5 text-sm leading-6 text-slate-700 empty:before:pointer-events-none empty:before:text-slate-400 empty:before:content-[attr(data-placeholder)] focus:outline-none"
                data-placeholder={
                  replyingTo
                    ? `Type your reply to #${replyingTo.id.slice(0, 6)}...`
                    : `Message our team about ${brandName}...`
                }
                dangerouslySetInnerHTML={{ __html: composerHtml }}
              />
            </div>
            <div className="flex items-center justify-between px-1">
              <button
                type="button"
                disabled={uploading || sending}
                onClick={() => fileInputRef.current?.click()}
                className="grid h-8 w-8 place-items-center rounded-lg text-primary transition hover:bg-white/70 disabled:opacity-40"
                title="Attach image or document"
                aria-label="Attach image or document"
              >
                {uploading ? <Loader2 size={17} className="animate-spin" /> : <Plus size={19} />}
              </button>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={startDictation}
                  disabled={sending || uploading}
                  className={`grid h-8 w-8 place-items-center rounded-lg text-primary/70 transition hover:bg-white/70 disabled:cursor-not-allowed disabled:opacity-40 ${dictating ? 'bg-white text-primary ring-1 ring-primary/25' : ''}`}
                  title={dictating ? 'Stop dictation' : 'Dictate your message'}
                  aria-label={dictating ? 'Stop dictation' : 'Dictate your message'}
                >
                  {dictating ? <MicOff size={16} /> : <Mic size={16} />}
                </button>
                <button
                  type="submit"
                  disabled={(!inputMessage.trim() && attachedFiles.length === 0 && selectedReferences.length === 0) || sending || uploading}
                  className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-white shadow-sm transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Send message"
                >
                  <ArrowUp size={17} strokeWidth={2.5} className={sending ? 'translate-y-0.5 opacity-50' : ''} />
                </button>
              </div>
            </div>
          </div>
        </form>
        {dictationError && <p role="alert" className="mt-1.5 px-1 text-[11px] font-medium text-red-600">{dictationError}</p>}
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


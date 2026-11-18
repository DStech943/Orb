/**
 * Chatspace Service
 * Supports Real-time WebSocket connection to Railway / FastAPI backend,
 * with Supabase Postgres persistence and local caching.
 * Features:
 *  - Real-time WebSocket bi-directional delivery
 *  - Sent / Read / Failed delivery statuses
 *  - Timestamps
 *  - Quoted replies (replyToId & replyToSnippet)
 *  - 4 Preset Emoji Reactions (👍, ❤️, 🚀, 👀)
 */

import { supabase } from '../lib/supabase'
import { activeBrandId, activeBrandName } from './orbApi'
import { avatarUrlFromKey, avatarUrlsFromKey } from './avatar'

const STORAGE_PREFIX = 'orb_chatspace_'
export const CHATSPACE_BUCKET = 'orb_chatspace_attachments'

export const PRESET_REACTIONS = ['👍', '❤️', '🚀', '👀']

/**
 * Upload a media file (image, document, PDF) to Supabase Storage bucket.
 * Falls back to Base64 data URL for offline / local mode.
 */
export const uploadChatspaceMedia = async (file, brandName = activeBrandName()) => {
  if (!file) throw new Error('No file provided')

  const brand = (brandName || 'default_brand').replace(/[^a-zA-Z0-9-_]/g, '_').toLowerCase()
  const ext = file.name?.split('.').pop() || 'bin'
  const uniqueName = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${ext}`
  const filePath = `${brand}/${uniqueName}`

  // 1. Try Supabase Storage bucket
  if (supabase) {
    try {
      const { data, error } = await supabase.storage
        .from(CHATSPACE_BUCKET)
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: true,
        })

      if (!error && data?.path) {
        const { data: publicUrlData } = supabase.storage
          .from(CHATSPACE_BUCKET)
          .getPublicUrl(data.path)

        return {
          id: uniqueName,
          name: file.name,
          size: file.size,
          type: file.type,
          url: publicUrlData?.publicUrl,
          path: data.path,
          bucket: CHATSPACE_BUCKET,
          isImage: file.type?.startsWith('image/'),
        }
      }
    } catch (err) {
      console.warn('Could not upload to Supabase storage bucket:', err)
    }
  }

  // 2. Client-side base64 fallback (for preview & offline resiliency)
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      resolve({
        id: uniqueName,
        name: file.name,
        size: file.size,
        type: file.type,
        url: reader.result,
        path: filePath,
        bucket: 'local',
        isImage: file.type?.startsWith('image/'),
      })
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

/**
 * Determine the WebSocket URL corresponding to the current API or local environment
 */
export const getChatspaceWebSocketUrl = (brandName = activeBrandName()) => {
  const configuredApiUrl = import.meta.env.VITE_ORB_API_URL
  const safeBrand = encodeURIComponent(brandName || 'default_brand')

  if (configuredApiUrl) {
    const wsUrl = configuredApiUrl.replace(/^http/, 'ws').replace(/\/$/, '')
    return `${wsUrl}/ws/chatspace/${safeBrand}`
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  // When running Vite dev server locally on port 5173, backend is on 8000
  if (import.meta.env.DEV && ['localhost', '127.0.0.1'].includes(window.location.hostname)) {
    return `ws://127.0.0.1:8000/ws/chatspace/${safeBrand}`
  }

  return `${protocol}//${window.location.host}/ws/chatspace/${safeBrand}`
}

// WebSocket Connection Singleton per brand
class ChatspaceWebSocketClient {
  constructor() {
    this.ws = null
    this.brandName = null
    this.listeners = new Set()
    this.reconnectTimer = null
    this.heartbeatTimer = null
  }

  connect(brandName) {
    if (!brandName) return
    if (this.brandName === brandName && this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return
    }

    this.disconnect()
    this.brandName = brandName
    const url = getChatspaceWebSocketUrl(brandName)

    try {
      this.ws = new WebSocket(url)

      this.ws.onopen = () => {
        // Start heartbeat ping every 25s
        clearInterval(this.heartbeatTimer)
        this.heartbeatTimer = setInterval(() => {
          if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: 'ping' }))
          }
        }, 25000)
        this.notifyStatus(true)
      }

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          this.handleIncoming(data)
        } catch {}
      }

      this.ws.onclose = () => {
        clearInterval(this.heartbeatTimer)
        this.notifyStatus(false)
        // Automatic reconnection attempt after 3s
        clearTimeout(this.reconnectTimer)
        this.reconnectTimer = setTimeout(() => {
          if (this.brandName === brandName) {
            this.connect(brandName)
          }
        }, 3000)
      }

      this.ws.onerror = () => {
        this.notifyStatus(false)
      }
    } catch {
      this.notifyStatus(false)
    }
  }

  disconnect() {
    clearTimeout(this.reconnectTimer)
    clearInterval(this.heartbeatTimer)
    if (this.ws) {
      this.ws.onclose = null
      this.ws.onerror = null
      this.ws.onmessage = null
      this.ws.close()
      this.ws = null
    }
    this.notifyStatus(false)
  }

  notifyStatus(connected) {
    window.dispatchEvent(
      new CustomEvent('orb:chatspace-ws-status', {
        detail: { brand: this.brandName, connected },
      })
    )
  }

  handleIncoming(data) {
    if (!data || data.type === 'pong' || data.type === 'connection_ack') return

    const brand = this.brandName || 'default_brand'
    const key = `${STORAGE_PREFIX}${brand}`

    let list = []
    try {
      const raw = window.localStorage.getItem(key)
      list = raw ? JSON.parse(raw) : []
    } catch {
      list = []
    }

    if (data.type === 'chat_message') {
      const existsIndex = list.findIndex((m) => m.id === data.id)
      const formatted = {
        id: data.id,
        brandId: data.brandId || data.brand_id || null,
        sender: { ...data.sender, avatar: avatarUrlFromKey(data.sender?.avatar), avatarSources: avatarUrlsFromKey(data.sender?.avatar) },
        content: data.content,
        media: data.media || [],
        references: data.references || data.message_references || [],
        mentions: data.mentions || [],
        status: data.status || 'read',
        replyToId: data.replyToId || null,
        replyToSnippet: data.replyToSnippet || null,
        reactions: data.reactions || {},
        pinnedUntil: data.pinnedUntil || data.pinned_until || null,
        pinnedBy: data.pinnedBy || data.pinned_by || null,
        pinnedByName: data.pinnedByName || data.pinned_by_name || null,
        editedAt: data.editedAt || data.edited_at || null,
        createdAt: data.createdAt,
      }

      if (existsIndex >= 0) {
        list[existsIndex] = formatted
      } else {
        list.push(formatted)
      }
      try {
        window.localStorage.setItem(key, JSON.stringify(list))
      } catch {}
    } else if (data.type === 'reaction_update') {
      list = list.map((m) => (m.id === data.messageId ? { ...m, reactions: data.reactions } : m))
      try {
        window.localStorage.setItem(key, JSON.stringify(list))
      } catch {}
    } else if (data.type === 'status_update') {
      list = list.map((m) => (m.id === data.messageId ? { ...m, status: data.status } : m))
      try {
        window.localStorage.setItem(key, JSON.stringify(list))
      } catch {}
    }

    this.listeners.forEach((fn) => fn(data))
    window.dispatchEvent(new CustomEvent('orb:client-chat-updated', { detail: { brand, event: data } }))
  }

  send(payload) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload))
      return true
    }
    return false
  }

  subscribe(callback) {
    this.listeners.add(callback)
    return () => this.listeners.delete(callback)
  }
}

export const wsClient = new ChatspaceWebSocketClient()

// Typing presence is deliberately WebSocket-only: it is transient UI state,
// not a message or audit record, so it never reaches Supabase.
export const sendChatspaceTyping = (currentUser, isTyping) => {
  if (!currentUser?.id) return false
  return wsClient.send({
    type: 'typing',
    userId: String(currentUser.id),
    userName: currentUser.name || currentUser.email?.split('@')[0] || 'Someone',
    avatar: currentUser.avatar || '',
    isTyping: Boolean(isTyping),
  })
}

// Mention targets are deliberately scoped to the selected brand. The database
// policy permits this read only when the signed-in person belongs to that same
// brand (or is internal Orb staff).
export const listBrandChatMembers = async (brandId = activeBrandId()) => {
  if (!supabase || !brandId) return []
  const { data, error } = await supabase
    .schema('cx_copilot')
    .from('brand_assignments')
    .select('id, name, role, avatar_key, is_online, created_at')
    .eq('brand_id', brandId)
    .order('is_online', { ascending: false })
    .order('created_at', { ascending: true })
  if (error) throw error
  return (Array.isArray(data) ? data : [])
    .filter((member) => String(member?.name || '').trim())
    .map((member) => ({
      id: String(member.id),
      handle: String(member.name).trim(),
      label: `@${String(member.name).trim()}`,
      role: String(member.role || 'client').replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()),
      description: member.is_online ? 'Online' : 'Offline',
      avatar: avatarUrlFromKey(member.avatar_key),
      avatarSources: avatarUrlsFromKey(member.avatar_key),
      initials: String(member.name).trim().split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase(),
    }))
}

export const getClientChatMessages = async (brandName = activeBrandName(), currentUser) => {
  const brand = brandName || 'default_brand'
  const key = `${STORAGE_PREFIX}${brand}`

  // Keep locally received rich-reference details while an older deployment or
  // a PostgREST schema refresh returns an empty JSONB column. This recovery is
  // keyed by the durable message UUID and is replaced as soon as the database
  // returns its canonical references.
  let cachedById = new Map()
  try {
    const cached = JSON.parse(window.localStorage.getItem(key) || '[]')
    cachedById = new Map((Array.isArray(cached) ? cached : []).map((message) => [message.id, message]))
  } catch {}

  const jsonArray = (value) => {
    if (Array.isArray(value)) return value
    if (typeof value !== 'string') return []
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed : parsed && typeof parsed === 'object' ? [parsed] : []
    } catch {
      return []
    }
  }

  // Ensure WebSocket is connected for active brand
  wsClient.connect(brand)

  // 1. Try Supabase Postgres
  if (supabase) {
    try {
      const { data, error } = await supabase
        .schema('cx_copilot')
        .from('orb_client_chat_messages')
        .select('*')
        .eq('brand_name', brand)
        .order('created_at', { ascending: true })

      if (!error && Array.isArray(data)) {
        const mapped = data.map((row) => {
          const databaseReferences = jsonArray(row.message_references)
          const cachedReferences = cachedById.get(row.id)?.references
          return {
          id: row.id,
          brandId: row.brand_id || null,
          sender: {
            id: row.sender_id || 'unknown',
            name: row.sender_name,
            role: row.sender_role,
            avatar: avatarUrlFromKey(row.sender_avatar),
            avatarSources: avatarUrlsFromKey(row.sender_avatar),
            initials: (row.sender_name || 'U')
              .split(' ')
              .map((n) => n[0])
              .join('')
              .slice(0, 2)
              .toUpperCase(),
          },
          content: row.content,
          references: databaseReferences.length ? databaseReferences : (Array.isArray(cachedReferences) ? cachedReferences : []),
          media: jsonArray(row.media),
          mentions: Array.isArray(row.mentions) ? row.mentions : [],
          status: row.status || 'read',
          replyToId: row.reply_to_id || null,
          replyToSnippet: row.reply_to_snippet || null,
          reactions: row.reactions || {},
          pinnedUntil: row.pinned_until || null,
          pinnedBy: row.pinned_by || null,
          pinnedByName: row.pinned_by_name || null,
          editedAt: row.edited_at || null,
          createdAt: row.created_at,
        }
        })
        try {
          window.localStorage.setItem(key, JSON.stringify(mapped))
        } catch {}
        return mapped
      }
    } catch {
      // Fallback to local storage
    }
  }

  // 2. Local Storage
  try {
    const raw = window.localStorage.getItem(key)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed
    }
  } catch {
    // ignore
  }

  return []
}

export const sendClientChatMessage = async ({
  brandName = activeBrandName(),
  brandId = activeBrandId(),
  content,
  media = [],
  references = [],
  mentions = [],
  currentUser,
  replyTo = null,
}) => {
  if ((!content || !content.trim()) && (!media || media.length === 0) && (!references || references.length === 0)) {
    throw new Error('Message cannot be empty')
  }
  const brand = brandName || 'default_brand'
  const key = `${STORAGE_PREFIX}${brand}`

  // Resolve brand_id if not explicitly provided
  let effectiveBrandId = brandId || activeBrandId() || null
  if (!effectiveBrandId && supabase && brand) {
    try {
      const { data } = await supabase
        .schema('cx_copilot')
        .from('brands')
        .select('id')
        .ilike('name', brand)
        .limit(1)
      if (data?.[0]?.id) effectiveBrandId = data[0].id
    } catch {}
  }

  const userSender = {
    id: currentUser?.id || `usr-${Date.now()}`,
    name: currentUser?.name || currentUser?.email?.split('@')[0] || 'Client User',
    role: currentUser?.role || 'client',
    avatar: avatarUrlFromKey(currentUser?.avatarKey || currentUser?.avatar),
    avatarSources: avatarUrlsFromKey(currentUser?.avatarKey || currentUser?.avatar),
    initials: (currentUser?.name || 'CU')
      .split(' ')
      .map((n) => n[0])
      .join('')
      .slice(0, 2)
      .toUpperCase(),
  }

  const generatedId = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`

  const newMessage = {
    id: generatedId,
    brandId: effectiveBrandId,
    sender: userSender,
    content: (content || '').trim(),
    media: media || [],
    references: references || [],
    mentions: mentions || [],
    createdAt: new Date().toISOString(),
    status: 'sent',
    replyToId: replyTo?.id || null,
    replyToSnippet: replyTo?.content ? replyTo.content.slice(0, 75) + (replyTo.content.length > 75 ? '...' : '') : null,
    reactions: {},
  }

  // 1. Write first. Sending on the WebSocket first can race with this insert:
  // an older worker writes the bare message, then the browser receives a
  // duplicate-key error and loses the rich-reference JSON for other viewers.
  if (supabase) {
    const payload = {
      id: generatedId,
      brand_id: effectiveBrandId,
      brand_name: brand,
      sender_id: currentUser?.id || null,
      sender_name: userSender.name,
      sender_role: userSender.role,
      sender_avatar: currentUser?.avatarKey || userSender.avatar,
      content: newMessage.content,
      media: newMessage.media,
      message_references: newMessage.references,
      mentions: newMessage.mentions,
      status: 'sent',
      reply_to_id: newMessage.replyToId,
      reply_to_snippet: newMessage.replyToSnippet,
      reactions: {},
      created_at: newMessage.createdAt,
    }
    try {
      const { error } = await supabase
        .schema('cx_copilot')
        .from('orb_client_chat_messages')
        .upsert(payload, { onConflict: 'id' })
      if (error) {
        // Keep a concise textual fallback for installations that have not run
        // the reference migration yet. The rich token includes a compact
        // snapshot, so it still restores the capsule in its exact position.
        const { mentions, message_references, ...fallbackPayload } = payload
        if (!fallbackPayload.content && newMessage.references.length) {
          fallbackPayload.content = `Shared: ${newMessage.references.map((reference) => reference.title).filter(Boolean).join(', ') || 'reference'}`
        }
        await supabase
          .schema('cx_copilot')
          .from('orb_client_chat_messages')
          .insert(fallbackPayload)
      }
    } catch (e) {
      console.warn('Could not insert to Supabase orb_client_chat_messages:', e)
    }
  }

  // 2. Broadcast after persistence so all connected workspaces receive the
  // complete reference payload, including product image and link metadata.
  wsClient.send({
    type: 'chat_message',
    ...newMessage,
    brandName: brand,
    brandId: effectiveBrandId,
  })

  // 3. Update local cache
  let list = []
  try {
    const raw = window.localStorage.getItem(key)
    list = raw ? JSON.parse(raw) : []
  } catch {
    list = []
  }

  const updatedList = [...list, newMessage]
  try {
    window.localStorage.setItem(key, JSON.stringify(updatedList))
  } catch {}

  window.dispatchEvent(new CustomEvent('orb:client-chat-updated', { detail: { brand } }))

  // Mark sent message as read after short confirmation
  setTimeout(() => {
    try {
      const rawNow = window.localStorage.getItem(key)
      if (rawNow) {
        const parsedNow = JSON.parse(rawNow)
        const markedRead = parsedNow.map((m) => m.id === generatedId ? { ...m, status: 'read' } : m)
        window.localStorage.setItem(key, JSON.stringify(markedRead))
        window.dispatchEvent(new CustomEvent('orb:client-chat-updated', { detail: { brand } }))
      }
    } catch {}
  }, 1000)

  return newMessage
}

export const toggleMessageReaction = async ({
  brandName = activeBrandName(),
  messageId,
  emoji,
  userName = 'You',
}) => {
  const brand = brandName || 'default_brand'
  const key = `${STORAGE_PREFIX}${brand}`

  let messages = []
  try {
    const raw = window.localStorage.getItem(key)
    messages = raw ? JSON.parse(raw) : []
  } catch {
    return
  }

  let nextReactions = {}
  const updated = messages.map((msg) => {
    if (msg.id !== messageId) return msg
    const currentReactions = { ...(msg.reactions || {}) }
    const userList = currentReactions[emoji] || []

    if (userList.includes(userName)) {
      currentReactions[emoji] = userList.filter((u) => u !== userName)
      if (currentReactions[emoji].length === 0) delete currentReactions[emoji]
    } else {
      currentReactions[emoji] = [...userList, userName]
    }
    nextReactions = currentReactions
    return { ...msg, reactions: currentReactions }
  })

  try {
    window.localStorage.setItem(key, JSON.stringify(updated))
    window.dispatchEvent(new CustomEvent('orb:client-chat-updated', { detail: { brand } }))
  } catch {}

  // Broadcast reaction over WebSocket
  wsClient.send({
    type: 'reaction_toggle',
    messageId,
    emoji,
    reactions: nextReactions,
  })

  // Update Supabase if available
  if (supabase) {
    try {
      await supabase
        .schema('cx_copilot')
        .from('orb_client_chat_messages')
        .update({ reactions: nextReactions })
        .eq('id', messageId)
    } catch {}
  }

  return updated
}

export const pinChatspaceMessage = async ({
  messageId,
  expiresAt,
  currentUser,
}) => {
  if (!supabase) throw new Error('Chatspace is not connected to Supabase.')
  if (!messageId || !currentUser?.id || !expiresAt) throw new Error('Could not pin this message.')

  const { data, error } = await supabase
    .schema('cx_copilot')
    .from('orb_client_chat_messages')
    .update({
      pinned_until: expiresAt,
      pinned_by: currentUser.id,
      pinned_by_name: currentUser.name || currentUser.email?.split('@')[0] || 'Member',
      updated_at: new Date().toISOString(),
    })
    .eq('id', messageId)
    .select('id, pinned_until, pinned_by, pinned_by_name')
    .maybeSingle()

  if (error) throw error
  if (!data) throw new Error('Message not found or you do not have permission to pin it.')
  return {
    id: data.id,
    pinnedUntil: data.pinned_until,
    pinnedBy: data.pinned_by,
    pinnedByName: data.pinned_by_name,
  }
}

export const deleteChatspaceMessage = async ({
  brandName = activeBrandName(),
  message,
  currentUser,
}) => {
  if (!supabase) throw new Error('Chatspace is not connected to Supabase.')
  if (!message?.id || !currentUser?.id) throw new Error('Could not delete this message.')

  const { data, error } = await supabase
    .schema('cx_copilot')
    .from('orb_client_chat_messages')
    .delete()
    .eq('id', message.id)
    .eq('brand_name', brandName || 'default_brand')
    .eq('sender_id', currentUser.id)
    .select('id')

  if (error) throw error
  if (!data?.length) throw new Error('Only the sender can delete this message.')

  // Remove files after the database delete succeeds. A storage-policy issue
  // must never make a deleted chat message reappear.
  const attachmentPaths = (Array.isArray(message.media) ? message.media : [])
    .filter((file) => file?.bucket === CHATSPACE_BUCKET && file?.path)
    .map((file) => file.path)
  if (attachmentPaths.length) {
    const { error: storageError } = await supabase.storage
      .from(CHATSPACE_BUCKET)
      .remove(attachmentPaths)
    if (storageError) console.warn('Message deleted, but some attachments could not be removed:', storageError)
  }

  const key = `${STORAGE_PREFIX}${brandName || 'default_brand'}`
  try {
    const cached = JSON.parse(window.localStorage.getItem(key) || '[]')
    window.localStorage.setItem(key, JSON.stringify((Array.isArray(cached) ? cached : []).filter((item) => item.id !== message.id)))
  } catch {}
  window.dispatchEvent(new CustomEvent('orb:client-chat-updated', { detail: { brand: brandName } }))
  return message.id
}

export const editChatspaceMessage = async ({
  brandName = activeBrandName(),
  messageId,
  content,
  currentUser,
}) => {
  if (!supabase) throw new Error('Chatspace is not connected to Supabase.')
  if (!messageId || !currentUser?.id || !String(content || '').trim()) {
    throw new Error('A message cannot be empty.')
  }

  const editedAt = new Date().toISOString()
  const { data, error } = await supabase
    .schema('cx_copilot')
    .from('orb_client_chat_messages')
    .update({ content, edited_at: editedAt, updated_at: editedAt })
    .eq('id', messageId)
    .eq('brand_name', brandName || 'default_brand')
    .eq('sender_id', currentUser.id)
    .select('id, content, edited_at')
    .maybeSingle()

  if (error) throw error
  if (!data) throw new Error('Only the sender can edit this message.')
  const updated = { id: data.id, content: data.content, editedAt: data.edited_at }
  const brand = brandName || 'default_brand'
  const key = `${STORAGE_PREFIX}${brand}`
  try {
    const cached = JSON.parse(window.localStorage.getItem(key) || '[]')
    window.localStorage.setItem(key, JSON.stringify((Array.isArray(cached) ? cached : []).map((message) => (
      message.id === data.id ? { ...message, ...updated } : message
    ))))
  } catch {}
  window.dispatchEvent(new CustomEvent('orb:client-chat-updated', { detail: { brand } }))
  return updated
}

export const updateMessageStatus = async ({
  brandName = activeBrandName(),
  messageId,
  status, // 'sent' | 'read' | 'failed'
}) => {
  const brand = brandName || 'default_brand'
  const key = `${STORAGE_PREFIX}${brand}`

  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return
    const messages = JSON.parse(raw)
    const updated = messages.map((msg) => (msg.id === messageId ? { ...msg, status } : msg))
    window.localStorage.setItem(key, JSON.stringify(updated))
    window.dispatchEvent(new CustomEvent('orb:client-chat-updated', { detail: { brand } }))
  } catch {}

  // Broadcast status update over WebSocket
  wsClient.send({
    type: 'status_update',
    messageId,
    status,
  })
}

export const getChatspaceUnreadStatus = (brandName = activeBrandName(), currentUser) => {
  const brand = brandName || 'default_brand'
  const key = `${STORAGE_PREFIX}${brand}`
  const lastReadTime = window.localStorage.getItem(`orb_chatspace_last_read:${brand}`) || '0'
  const myId = currentUser?.id
  const myName = (currentUser?.name || currentUser?.email?.split('@')[0] || '').toLowerCase()
  const myFirstName = myName ? myName.split(' ')[0] : ''

  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return { unreadCount: 0, hasMention: false, mentionCount: 0 }
    const list = JSON.parse(raw)
    if (!Array.isArray(list)) return { unreadCount: 0, hasMention: false, mentionCount: 0 }

    let unreadCount = 0
    let mentionCount = 0

    list.forEach((m) => {
      const isFromMe = myId
        ? m.sender?.id === myId
        : myName && m.sender?.name
        ? m.sender.name.toLowerCase() === myName
        : false
      const msgTime = new Date(m.createdAt).getTime()
      const isNewerThanRead = msgTime > Number(lastReadTime)

      if (!isFromMe && isNewerThanRead) {
        unreadCount += 1

        const mentions = Array.isArray(m.mentions) ? m.mentions.map((x) => String(x).toLowerCase()) : []
        const content = (m.content || '').toLowerCase()

        const isTagged =
          mentions.includes('all') ||
          mentions.includes('team') ||
          (myName && mentions.some((name) => myName.includes(name) || name.includes(myName))) ||
          (myFirstName && mentions.some((name) => name === myFirstName)) ||
          content.includes('@all') ||
          content.includes('@team') ||
          (myName && content.includes(`@${myName}`)) ||
          (myFirstName && content.includes(`@${myFirstName}`))

        if (isTagged) {
          mentionCount += 1
        }
      }
    })

    return {
      unreadCount,
      hasMention: mentionCount > 0,
      mentionCount,
    }
  } catch {
    return { unreadCount: 0, hasMention: false, mentionCount: 0 }
  }
}

export const getUnreadChatCount = (brandName = activeBrandName(), currentUser) => {
  return getChatspaceUnreadStatus(brandName, currentUser).unreadCount
}

export const getChatspaceReadReceipts = async (brandName = activeBrandName()) => {
  if (!supabase || !brandName) return []
  const { data, error } = await supabase
    .schema('cx_copilot')
    .from('orb_client_chat_read_receipts')
    .select('user_id, reader_name, reader_avatar, last_read_message_id, read_at')
    .eq('brand_name', brandName)
  if (error) throw error
  return (Array.isArray(data) ? data : []).map((receipt) => ({
    ...receipt,
    avatar: avatarUrlFromKey(receipt.reader_avatar),
    avatarSources: avatarUrlsFromKey(receipt.reader_avatar),
  }))
}

export const subscribeToChatReadReceipts = (brandName, onChange) => {
  if (!supabase || !brandName) return () => {}
  const channel = supabase
    .channel(`chatspace-receipts:${brandName}`)
    .on('postgres_changes', {
      event: '*', schema: 'cx_copilot', table: 'orb_client_chat_read_receipts', filter: `brand_name=eq.${brandName}`,
    }, () => onChange?.())
    .subscribe()
  return () => { supabase.removeChannel(channel) }
}

export const markChatspaceAsRead = async (brandName = activeBrandName(), currentUser, lastReadMessageId = null) => {
  const brand = brandName || 'default_brand'
  window.localStorage.setItem(`orb_chatspace_last_read:${brand}`, String(Date.now()))
  window.dispatchEvent(new CustomEvent('orb:chatspace-unread-changed', { detail: { brand, count: 0 } }))
  if (!supabase || !currentUser?.id || !lastReadMessageId) return null
  const payload = {
    brand_id: activeBrandId() || null,
    brand_name: brand,
    user_id: currentUser.id,
    reader_name: currentUser.name || currentUser.email?.split('@')[0] || 'Member',
    reader_avatar: currentUser.avatarKey || currentUser.avatar || null,
    last_read_message_id: lastReadMessageId,
    read_at: new Date().toISOString(),
  }
  const { data, error } = await supabase
    .schema('cx_copilot')
    .from('orb_client_chat_read_receipts')
    .upsert(payload, { onConflict: 'brand_name,user_id' })
    .select()
    .maybeSingle()
  if (error) throw error
  return data
}

export const subscribeToChatMessages = (brandName, onNewMessage) => {
  if (!brandName) return () => {}

  // 1. Connect WebSocket
  wsClient.connect(brandName)
  const unsubscribeWs = wsClient.subscribe((data) => {
    onNewMessage?.(data)
  })

  // 2. Also listen to Supabase Postgres Realtime if enabled
  let supabaseChannel = null
  if (supabase) {
    try {
      supabaseChannel = supabase
        .channel(`chatspace:${brandName}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'cx_copilot',
            table: 'orb_client_chat_messages',
            filter: `brand_name=eq.${brandName}`,
          },
          (payload) => {
            onNewMessage?.(payload)
          }
        )
        .subscribe()
    } catch {}
  }

  return () => {
    unsubscribeWs?.()
    if (supabaseChannel) supabaseChannel.unsubscribe?.()
  }
}



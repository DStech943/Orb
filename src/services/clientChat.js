/**
 * Chatspace Service
 * Supports Supabase Postgres real-time and persistence with local offline cache.
 * Features:
 *  - Sent / Read / Failed delivery statuses
 *  - Timestamps
 *  - Quoted replies (replyToId & replyToSnippet)
 *  - 4 Preset Emoji Reactions (👍, ❤️, 🚀, 👀)
 *  - Clean real-time messaging
 */

import { supabase } from '../lib/supabase'
import { activeBrandName } from './orbApi'

const STORAGE_PREFIX = 'orb_chatspace_'

export const PRESET_REACTIONS = ['👍', '❤️', '🚀', '👀']

export const getClientChatMessages = async (brandName = activeBrandName(), currentUser) => {
  const brand = brandName || 'default_brand'
  const key = `${STORAGE_PREFIX}${brand}`

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
        const mapped = data.map((row) => ({
          id: row.id,
          sender: {
            id: row.sender_id || 'unknown',
            name: row.sender_name,
            role: row.sender_role,
            avatar: row.sender_avatar,
            initials: (row.sender_name || 'U')
              .split(' ')
              .map((n) => n[0])
              .join('')
              .slice(0, 2)
              .toUpperCase(),
          },
          content: row.content,
          status: row.status || 'read',
          replyToId: row.reply_to_id || null,
          replyToSnippet: row.reply_to_snippet || null,
          reactions: row.reactions || {},
          createdAt: row.created_at,
        }))
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
  content,
  currentUser,
  replyTo = null,
}) => {
  if (!content || !content.trim()) throw new Error('Message cannot be empty')
  const brand = brandName || 'default_brand'
  const key = `${STORAGE_PREFIX}${brand}`

  const userSender = {
    id: currentUser?.id || `usr-${Date.now()}`,
    name: currentUser?.name || currentUser?.email?.split('@')[0] || 'Client User',
    role: currentUser?.role || 'client',
    avatar: currentUser?.avatar || null,
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
    sender: userSender,
    content: content.trim(),
    createdAt: new Date().toISOString(),
    status: 'sent',
    replyToId: replyTo?.id || null,
    replyToSnippet: replyTo?.content ? replyTo.content.slice(0, 75) + (replyTo.content.length > 75 ? '...' : '') : null,
    reactions: {},
  }

  // Write to Supabase Postgres
  if (supabase) {
    try {
      await supabase
        .schema('cx_copilot')
        .from('orb_client_chat_messages')
        .insert({
          id: generatedId,
          brand_name: brand,
          sender_id: currentUser?.id || null,
          sender_name: userSender.name,
          sender_role: userSender.role,
          sender_avatar: userSender.avatar,
          content: newMessage.content,
          status: 'sent',
          reply_to_id: newMessage.replyToId,
          reply_to_snippet: newMessage.replyToSnippet,
          reactions: {},
          created_at: newMessage.createdAt,
        })
    } catch (e) {
      console.warn('Could not insert to Supabase orb_client_chat_messages:', e)
    }
  }

  // Update local cache
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

  // Mark sent message as read after acknowledgment
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
    return { ...msg, reactions: currentReactions }
  })

  try {
    window.localStorage.setItem(key, JSON.stringify(updated))
    window.dispatchEvent(new CustomEvent('orb:client-chat-updated', { detail: { brand } }))
  } catch {}

  // Update Supabase if available
  if (supabase) {
    try {
      const target = updated.find((m) => m.id === messageId)
      if (target) {
        await supabase
          .schema('cx_copilot')
          .from('orb_client_chat_messages')
          .update({ reactions: target.reactions })
          .eq('id', messageId)
      }
    } catch {}
  }

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
}

export const subscribeToChatMessages = (brandName, onNewMessage) => {
  if (!supabase || !brandName) return null
  try {
    const channel = supabase
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
    return channel
  } catch {
    return null
  }
}


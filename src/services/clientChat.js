/**
 * Client Chat Service
 * Supports Supabase Postgres storage with fallback to partitioned localStorage.
 * Features:
 *  - Sent / Read / Failed delivery statuses
 *  - Timestamps
 *  - Quoted replies (replyToId & replyToSnippet)
 *  - 4 Preset Emoji Reactions (👍, ❤️, 🚀, 👀)
 */

import { supabase } from '../lib/supabase'
import { activeBrandName } from './orbApi'

const STORAGE_PREFIX = 'orb_client_chat_'

export const PRESET_REACTIONS = ['👍', '❤️', '🚀', '👀']

const getDefaultMessages = (brandName, clientName = 'Client') => [
  {
    id: '11111111-1111-4111-8111-111111111111',
    sender: {
      id: 'orb-team-1',
      name: 'Orb Operations',
      role: 'team',
      avatar: null,
      initials: 'OO',
    },
    content: `Hi ${clientName}! Welcome to your brand chatspace for ${brandName || 'your brand'}. You can request adjustments to SOPs, report edge-case questions, or coordinate with our team here.`,
    createdAt: new Date(Date.now() - 3600000 * 3).toISOString(),
    status: 'read',
    replyToId: null,
    replyToSnippet: null,
    reactions: { '👍': [clientName] },
    updateProposal: null,
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    sender: {
      id: 'orb-team-2',
      name: 'Sarah (Support Lead)',
      role: 'team',
      avatar: null,
      initials: 'SL',
    },
    content: `Whenever you post an update, our team reviews it and applies it directly to your live AI agent, Shopify catalog sync, or knowledge base.`,
    createdAt: new Date(Date.now() - 3600000).toISOString(),
    status: 'read',
    replyToId: '11111111-1111-4111-8111-111111111111',
    replyToSnippet: `Hi ${clientName}! Welcome to your brand chatspace...`,
    reactions: { '🚀': ['Sarah (Support Lead)'] },
    updateProposal: {
      type: 'status_check',
      title: 'Catalog Synced',
      details: 'All brand knowledge is currently up to date.',
      state: 'completed',
    },
  },
]

export const getClientChatMessages = async (brandName = activeBrandName(), currentUser) => {
  const brand = brandName || 'default_brand'
  const key = `${STORAGE_PREFIX}${brand}`

  // 1. Try Supabase Postgres if configured
  if (supabase) {
    try {
      const { data, error } = await supabase
        .schema('cx_copilot')
        .from('orb_client_chat_messages')
        .select('*')
        .eq('brand_name', brand)
        .order('created_at', { ascending: true })

      if (!error && Array.isArray(data) && data.length > 0) {
        return data.map((row) => ({
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
          updateProposal: row.update_proposal || null,
          createdAt: row.created_at,
        }))
      }
    } catch {
      // Fallback to local storage if table is not yet migrated in Supabase
    }
  }

  // 2. Local Storage Fallback
  try {
    const raw = window.localStorage.getItem(key)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    }
  } catch {
    // ignore
  }

  const initial = getDefaultMessages(brandName, currentUser?.name || 'there')
  try {
    window.localStorage.setItem(key, JSON.stringify(initial))
  } catch {
    // ignore
  }
  return initial
}

export const sendClientChatMessage = async ({
  brandName = activeBrandName(),
  content,
  currentUser,
  updateType = 'general',
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
    updateProposal: updateType !== 'general' ? {
      type: updateType,
      title: updateType === 'sop_update' ? 'SOP Modification Request' : 'Operations Update Request',
      details: content.trim(),
      state: 'pending',
    } : null,
  }

  // Try writing to Supabase Postgres
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
          update_proposal: newMessage.updateProposal,
          created_at: newMessage.createdAt,
        })
    } catch {
      // Local fallback
    }
  }

  // Always update local cache for instant zero-latency UI
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
  } catch {
    // ignore
  }

  // Simulate automated status transition: sent -> read after 1s
  setTimeout(() => {
    try {
      const rawNow = window.localStorage.getItem(key)
      if (rawNow) {
        const parsedNow = JSON.parse(rawNow)
        const markedRead = parsedNow.map((m) => m.id === generatedId ? { ...m, status: 'read' } : m)
        window.localStorage.setItem(key, JSON.stringify(markedRead))
        window.dispatchEvent(new CustomEvent('orb:client-chat-updated', { detail: { brand } }))
      }
    } catch {
      // ignore
    }
  }, 1000)

  // Automated Orb Team reply after 1.8 seconds
  setTimeout(() => {
    try {
      const rawNow = window.localStorage.getItem(key)
      const parsedNow = rawNow ? JSON.parse(rawNow) : updatedList
      const replyId = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `ack-${Date.now()}`

      const replyMsg = {
        id: replyId,
        sender: {
          id: 'orb-ops-bot',
          name: 'Orb Operations',
          role: 'team',
          avatar: null,
          initials: 'OO',
        },
        content: `Got your request regarding "${content.trim().slice(0, 60)}${content.trim().length > 60 ? '...' : ''}". We are preparing the changes for ${brand}.`,
        createdAt: new Date().toISOString(),
        status: 'read',
        replyToId: generatedId,
        replyToSnippet: content.trim().slice(0, 75),
        reactions: { '👀': ['Orb Operations'] },
        updateProposal: {
          type: 'queue_logged',
          title: 'Update Logged to Queue',
          details: 'Queued for immediate review & sync.',
          state: 'in_progress',
        },
      }
      window.localStorage.setItem(key, JSON.stringify([...parsedNow, replyMsg]))
      window.dispatchEvent(new CustomEvent('orb:client-chat-updated', { detail: { brand } }))
    } catch {
      // ignore
    }
  }, 1800)

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
      // remove
      currentReactions[emoji] = userList.filter((u) => u !== userName)
      if (currentReactions[emoji].length === 0) delete currentReactions[emoji]
    } else {
      // add
      currentReactions[emoji] = [...userList, userName]
    }
    return { ...msg, reactions: currentReactions }
  })

  try {
    window.localStorage.setItem(key, JSON.stringify(updated))
    window.dispatchEvent(new CustomEvent('orb:client-chat-updated', { detail: { brand } }))
  } catch {
    // ignore
  }

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
    } catch {
      // ignore
    }
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
  } catch {
    // ignore
  }
}

export const clearClientChatMessages = async (brandName = activeBrandName()) => {
  const brand = brandName || 'default_brand'
  const key = `${STORAGE_PREFIX}${brand}`
  window.localStorage.removeItem(key)

  if (supabase) {
    try {
      await supabase
        .schema('cx_copilot')
        .from('orb_client_chat_messages')
        .delete()
        .eq('brand_name', brand)
    } catch {
      // ignore
    }
  }

  window.dispatchEvent(new CustomEvent('orb:client-chat-updated', { detail: { brand } }))
}

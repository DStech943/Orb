/**
 * Customer conversations for the client portal.
 *
 * Real conversations only, read by the API from the brand's own conversation tables. The
 * list is paged and filtered on the server, customer phone numbers are masked, and the raw
 * conversation id never reaches the browser. Nothing is invented to fill an empty list: a
 * brand with no conversations simply has none.
 */

import { getBrandConversationMessages, listBrandConversationThreads } from './orbApi'

export async function listBrandConversations(brandId, options = {}) {
  if (!brandId) return { items: [], total: 0, limit: options.limit || 25, offset: 0 }
  const result = await listBrandConversationThreads(brandId, options)
  if (!result) throw new Error('The Orb API is not connected, so conversations are unavailable.')
  return result
}

export async function getConversationMessages(brandId, threadId) {
  const result = await getBrandConversationMessages(brandId, threadId)
  if (!result) throw new Error('The Orb API is not connected, so this conversation is unavailable.')
  return result
}

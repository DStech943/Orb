import { supabase } from '../lib/supabase'

const DEFAULT_AVATAR_BUCKET = import.meta.env.VITE_ORB_AVATAR_BUCKET || 'avatars'

/** Turns a stored `avatar_key` into a browser-safe image URL. */
export const avatarUrlFromKey = (avatarKey) => {
  const key = String(avatarKey || '').trim()
  if (!key) return ''
  if (/^(?:https?:|data:|blob:)/i.test(key)) return key

  // `bucket:path/to/avatar.png` can override the default Orb avatar bucket.
  const separator = key.indexOf(':')
  const bucket = separator > 0 ? key.slice(0, separator) : DEFAULT_AVATAR_BUCKET
  const path = (separator > 0 ? key.slice(separator + 1) : key).replace(/^\/+/, '')
  if (!path || !supabase) return ''
  const { data } = supabase.storage.from(bucket).getPublicUrl(path)
  return data?.publicUrl || ''
}

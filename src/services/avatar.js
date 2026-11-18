import { supabase } from '../lib/supabase'

const configuredBucket = import.meta.env.VITE_ORB_AVATAR_BUCKET || ''
// Avatar keys already exist in a few formats across the workspace. Keep the
// configured bucket first, then support the legacy media/profile buckets.
const knownBuckets = [configuredBucket, 'media', 'avatars', 'avatar', 'profile-pictures', 'profile_pictures', 'agent-avatars', 'agent_avatars'].filter(Boolean)

const publicUrl = (bucket, path) => {
  if (!bucket || !path || !supabase) return ''
  const { data } = supabase.storage.from(bucket).getPublicUrl(path)
  return data?.publicUrl || ''
}

/**
 * Returns image URLs for an avatar_key, in preferred order. avatar_key may be
 * a complete URL, a `bucket:path` pair, or a storage object path. Raw object
 * paths are tried in the configured bucket and Orb's legacy media buckets so
 * a renamed bucket does not silently turn every profile back into initials.
 */
export const avatarUrlsFromKey = (avatarKey) => {
  const key = String(avatarKey || '').trim()
  if (!key) return []
  if (/^(?:https?:|data:|blob:)/i.test(key) || key.startsWith('/')) return [key]

  const separator = key.indexOf(':')
  if (separator > 0) {
    const url = publicUrl(key.slice(0, separator), key.slice(separator + 1).replace(/^\/+/, ''))
    return url ? [url] : []
  }

  const pathParts = key.replace(/^\/+/, '').split('/')
  const embeddedBucket = knownBuckets.includes(pathParts[0]) ? pathParts[0] : ''
  const candidates = []
  if (embeddedBucket && pathParts.length > 1) candidates.push(publicUrl(embeddedBucket, pathParts.slice(1).join('/')))
  knownBuckets.forEach((bucket) => candidates.push(publicUrl(bucket, key.replace(/^\/+/, ''))))
  return [...new Set(candidates.filter(Boolean))]
}

const avatarLocationsFromKey = (avatarKey) => {
  const key = String(avatarKey || '').trim()
  if (!key || /^(?:https?:|data:|blob:)/i.test(key) || key.startsWith('/')) return []
  const separator = key.indexOf(':')
  if (separator > 0) return [{ bucket: key.slice(0, separator), path: key.slice(separator + 1).replace(/^\/+/, '') }]

  const pathParts = key.replace(/^\/+/, '').split('/')
  const embeddedBucket = knownBuckets.includes(pathParts[0]) ? pathParts[0] : ''
  const locations = embeddedBucket && pathParts.length > 1
    ? [{ bucket: embeddedBucket, path: pathParts.slice(1).join('/') }]
    : []
  knownBuckets.forEach((bucket) => locations.push({ bucket, path: key.replace(/^\/+/, '') }))
  return locations.filter(({ bucket, path }) => bucket && path)
}

/**
 * Public URLs are quick for public buckets; signed URLs make the same stored
 * avatar_key work when a team's media bucket is private. Failures are ignored
 * so Avatar can continue to the initials fallback.
 */
export const signedAvatarUrlsFromKey = async (avatarKey) => {
  if (!supabase) return []
  const locations = avatarLocationsFromKey(avatarKey)
  const results = await Promise.all(locations.map(async ({ bucket, path }) => {
    try {
      const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 60 * 8)
      return error ? '' : data?.signedUrl || ''
    } catch {
      return ''
    }
  }))
  return [...new Set(results.filter(Boolean))]
}

/** Preferred URL for simple image renderers. Use avatarUrlsFromKey where an
 * image component can retry candidates after a failed load. */
export const avatarUrlFromKey = (avatarKey) => avatarUrlsFromKey(avatarKey)[0] || ''

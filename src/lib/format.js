const UNITS = [
  ['year', 31536000],
  ['month', 2592000],
  ['week', 604800],
  ['day', 86400],
  ['hour', 3600],
  ['minute', 60],
]

const rtf = typeof Intl !== 'undefined' && Intl.RelativeTimeFormat ? new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }) : null

/** "3 hours ago", "yesterday", or '' when the value is not a usable date. */
export function timeAgo(value) {
  if (!value) return ''
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const seconds = Math.round((date.getTime() - Date.now()) / 1000)
  const abs = Math.abs(seconds)
  if (abs < 45) return 'just now'
  for (const [unit, size] of UNITS) {
    if (abs >= size) return rtf ? rtf.format(Math.round(seconds / size), unit) : `${Math.round(abs / size)} ${unit}s ago`
  }
  return rtf ? rtf.format(Math.round(seconds / 60), 'minute') : 'moments ago'
}

export function formatDateTime(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date)
}

export const pluralize = (count, singular, plural = `${singular}s`) => `${count} ${count === 1 ? singular : plural}`

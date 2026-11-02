export const ORB_VOICE_WAKE_EVENT = 'orb:voice-wake-changed'
export const ORB_VOICE_WAKE_STATUS_EVENT = 'orb:voice-wake-status-changed'

const STORAGE_KEY = 'orb_voice_wake_enabled'

export const supportsOrbVoiceWake = () => {
  if (typeof window === 'undefined') return false
  return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition)
}

export const isOrbVoiceWakeEnabled = () => {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

export const setOrbVoiceWakeEnabled = (enabled) => {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, enabled ? 'true' : 'false')
  } catch {
    // Private browsing or restrictive browser settings can disable storage.
  }
  window.dispatchEvent(new CustomEvent(ORB_VOICE_WAKE_EVENT, { detail: { enabled: Boolean(enabled) } }))
}

export const setOrbVoiceWakeStatus = (status) => {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(ORB_VOICE_WAKE_STATUS_EVENT, { detail: { status } }))
}

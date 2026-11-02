export const supportsBrowserDictation = () => {
  if (typeof window === 'undefined') return false
  return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition)
}

// Starts a short, browser-owned dictation session. The browser shows its native
// microphone permission UI when needed; no audio is sent through the Orb API.
export const startBrowserDictation = ({ onTranscript, onEnd, onError }) => {
  if (!supportsBrowserDictation()) {
    onError?.('unsupported')
    onEnd?.()
    return null
  }

  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition
  const recognition = new Recognition()
  let finished = false
  const finish = () => {
    if (finished) return
    finished = true
    onEnd?.()
  }

  recognition.continuous = false
  recognition.interimResults = true
  recognition.maxAlternatives = 1
  recognition.lang = navigator.language?.startsWith('en') ? navigator.language : 'en-IN'
  recognition.onresult = (event) => {
    const transcript = Array.from(event.results)
      .map((result) => result[0]?.transcript || '')
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
    onTranscript?.(transcript, event.results[event.results.length - 1]?.isFinal === true)
  }
  recognition.onerror = (event) => {
    if (event.error !== 'aborted' && event.error !== 'no-speech') onError?.(event.error)
  }
  recognition.onend = finish

  try {
    recognition.start()
  } catch {
    onError?.('start-failed')
    finish()
    return null
  }

  return {
    stop: () => {
      try { recognition.stop() } catch { finish() }
    },
  }
}

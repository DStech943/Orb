import React, { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowUp, ArrowUpRight, Loader2, Mic, MicOff, Plus, X } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import Orb from '../Orb'
import { askOrbGuide } from '../../services/orbApi'
import { isOrbVoiceWakeEnabled, ORB_VOICE_WAKE_EVENT, setOrbVoiceWakeEnabled, setOrbVoiceWakeStatus } from '../../lib/orbVoiceWake'
import { startBrowserDictation } from '../../lib/browserDictation'

const pages = {
  '/app': { title: 'Overview', summary: "This is your brand's at-a-glance workspace for support activity and content progress." },
  '/app/workspace': { title: 'Brand workspace', summary: 'Use this page to add the brand context Orb needs for support content.' },
  '/app/chat': { title: 'Agent chat', summary: "Use this page to test the selected brand's deployed support agent." },
  '/app/sops': { title: 'SOPs', summary: 'Use this page to review and manage support operating procedures.' },
  '/app/flows': { title: 'Flows', summary: 'Use this page to build visual support flows or have Orb draft one from a prompt.' },
  '/app/faqs': { title: 'FAQs', summary: 'Use this page to review and manage customer-facing questions and answers.' },
  '/app/products': { title: 'Products', summary: 'Use this page to review product knowledge for the support experience.' },
  '/app/tools': { title: 'Tools', summary: 'Use this page to inspect systems, tools, and prerequisites for support work.' },
  '/app/settings': { title: 'Settings', summary: 'Use this page to manage your profile, team access, and app preferences.' },
}

const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

// Speech recognition frequently transcribes “Orb” as “or” / “orbe”. Keeping
// those common variants here makes the wake phrase more forgiving without
// matching ordinary conversation that does not begin with a greeting.
const WAKE_PHRASE = /\b(?:hey|hi|okay|ok)[\s,.-]+(?:orb|orbe|or)\b[\s,!?-]*/i
const isNavigationCommand = (value) => /(?:^\s*(?:please\s+)?(?:go|open|navigate|switch|show)\b)|(?:\b(?:take|bring)\s+me\s+to\b)|(?:\b(?:can|could|would)\s+you\s+(?:open|navigate|take)\b)/i.test(value)

export default function OrbGuide() {
  const location = useLocation()
  const navigate = useNavigate()
  const currentPath = pages[location.pathname] ? location.pathname : '/app'
  const current = pages[currentPath]
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [messages, setMessages] = useState([])
  const [thinking, setThinking] = useState(false)
  const [typedPlaceholder, setTypedPlaceholder] = useState('')
  const [voiceWakeEnabled, setVoiceWakeEnabled] = useState(isOrbVoiceWakeEnabled)
  const [dictating, setDictating] = useState(false)
  const [dictationError, setDictationError] = useState('')
  const [voiceDictationRequest, setVoiceDictationRequest] = useState(0)
  const inputRef = useRef(null)
  const recognitionRef = useRef(null)
  const restartTimerRef = useRef(null)
  const lastWakeRef = useRef(0)
  const dictationRef = useRef(null)
  const resumeWakeAfterDictationRef = useRef(false)
  const closeTimerRef = useRef(null)
  const draftRef = useRef('')
  const flowPage = location.pathname === '/app/flows'
  const rotatingPrompts = [`What's happening on ${current.title}?`, 'Where do I create a support flow?', 'Where can I test my AI agent?']

  useEffect(() => { draftRef.current = draft }, [draft])

  const startDictation = useCallback(() => {
    if (thinking) return
    if (dictationRef.current) {
      dictationRef.current.stop()
      return
    }
    const base = draftRef.current.trim()
    setDictationError('')
    setDictating(true)
    const session = startBrowserDictation({
      onTranscript: (transcript) => setDraft([base, transcript].filter(Boolean).join(base && transcript ? ' ' : '')),
      onError: (error) => setDictationError(error === 'unsupported' ? 'Speech-to-text is not supported in this browser.' : error === 'not-allowed' || error === 'service-not-allowed' ? 'Microphone permission is required for dictation.' : 'Could not start speech-to-text.'),
      onEnd: () => {
        dictationRef.current = null
        setDictating(false)
        if (resumeWakeAfterDictationRef.current) {
          resumeWakeAfterDictationRef.current = false
          window.clearTimeout(closeTimerRef.current)
          setOpen(false)
        }
      },
    })
    if (session) dictationRef.current = session
  }, [thinking])

  const closeGuide = useCallback(() => {
    setVoiceDictationRequest(0)
    setDictationError('')
    if (!dictationRef.current) {
      setOpen(false)
      return
    }
    // Do not restart the wake listener until browser dictation has released
    // the microphone. Otherwise Chromium can leave both recognizers stalled.
    resumeWakeAfterDictationRef.current = true
    dictationRef.current.stop()
    window.clearTimeout(closeTimerRef.current)
    closeTimerRef.current = window.setTimeout(() => {
      if (!resumeWakeAfterDictationRef.current) return
      resumeWakeAfterDictationRef.current = false
      dictationRef.current = null
      setDictating(false)
      setOpen(false)
    }, 700)
  }, [])

  useEffect(() => () => {
    window.clearTimeout(closeTimerRef.current)
    dictationRef.current?.stop()
  }, [])

  useEffect(() => {
    if (open) window.setTimeout(() => inputRef.current?.focus(), 160)
  }, [open])

  useEffect(() => {
    if (!open || draft) { setTypedPlaceholder(''); return undefined }
    let promptIndex = 0
    let character = 0
    let deleting = false
    let timer
    let cancelled = false
    const tick = () => {
      if (cancelled) return
      const prompt = rotatingPrompts[promptIndex]
      if (deleting) {
        character -= 1
        setTypedPlaceholder(prompt.slice(0, character))
        if (character === 0) {
          deleting = false
          promptIndex = (promptIndex + 1) % rotatingPrompts.length
        }
        timer = window.setTimeout(tick, 24)
        return
      }
      character += 1
      setTypedPlaceholder(prompt.slice(0, character))
      if (character === prompt.length) {
        deleting = true
        timer = window.setTimeout(tick, 1300)
        return
      }
      timer = window.setTimeout(tick, 38)
    }
    timer = window.setTimeout(tick, 320)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [open, draft, current.title])

  useEffect(() => {
    const onKeyDown = (event) => { if (event.key === 'Escape') closeGuide() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [closeGuide])

  useEffect(() => {
    const onVoiceWakeChange = (event) => setVoiceWakeEnabled(Boolean(event.detail?.enabled))
    window.addEventListener(ORB_VOICE_WAKE_EVENT, onVoiceWakeChange)
    return () => window.removeEventListener(ORB_VOICE_WAKE_EVENT, onVoiceWakeChange)
  }, [])

  useEffect(() => {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!voiceWakeEnabled) {
      return undefined
    }
    if (flowPage || open) {
      setOrbVoiceWakeStatus('paused')
      return undefined
    }
    if (!Recognition) {
      setOrbVoiceWakeStatus('unsupported')
      setOrbVoiceWakeEnabled(false)
      return undefined
    }

    let mounted = true
    let stopped = false
    let starting = false
    let wakeRequested = false
    let wakeHandled = false
    let pendingQuestion = ''
    const recognition = new Recognition()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.maxAlternatives = 1
    recognition.lang = navigator.language?.startsWith('en') ? navigator.language : 'en-IN'
    recognitionRef.current = recognition

    const stop = () => {
      stopped = true
      window.clearTimeout(restartTimerRef.current)
      try { recognition.abort() } catch { /* Recognition may not have started yet. */ }
    }
    const openFromWake = () => {
      if (!mounted || wakeHandled) return
      wakeHandled = true
      setOpen(true)
      if (pendingQuestion) setDraft(pendingQuestion)
      // Start the short dictation session only after the long-lived listener
      // has fully ended. Starting both at once makes Chrome reject one of them.
      setVoiceDictationRequest(Date.now())
    }
    const stopForWake = () => {
      wakeRequested = true
      stopped = true
      window.clearTimeout(restartTimerRef.current)
      try {
        // `stop` lets the recognizer finish its current result and emit `end`.
        // That is the safe point to hand the microphone to dictation.
        recognition.stop()
      } catch {
        window.setTimeout(openFromWake, 450)
      }
    }
    const start = () => {
      if (!mounted || stopped || document.hidden || starting) return
      starting = true
      setOrbVoiceWakeStatus('starting')
      try {
        recognition.start()
      } catch {
        starting = false
        restartTimerRef.current = window.setTimeout(start, 1500)
      }
    }
    const scheduleRestart = (delay = 900) => {
      if (!mounted || stopped || document.hidden) return
      window.clearTimeout(restartTimerRef.current)
      restartTimerRef.current = window.setTimeout(start, delay)
    }

    recognition.onstart = () => {
      starting = false
      setOrbVoiceWakeStatus('listening')
    }
    recognition.onresult = (event) => {
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index]
        // Waiting for the final transcript prevents an interim “Hey Orb” from
        // cutting off the rest of a spoken question.
        if (!result.isFinal) continue
        const transcript = result[0]?.transcript?.trim() || ''
        const match = transcript.match(WAKE_PHRASE)
        if (!match || Date.now() - lastWakeRef.current < 2000) continue
        lastWakeRef.current = Date.now()
        pendingQuestion = transcript.slice((match.index || 0) + match[0].length).trim()
        stopForWake()
        break
      }
    }
    recognition.onerror = (event) => {
      starting = false
      if (['not-allowed', 'service-not-allowed', 'audio-capture'].includes(event.error)) {
        stop()
        setOrbVoiceWakeStatus(event.error === 'audio-capture' ? 'microphone-unavailable' : 'permission-denied')
        setOrbVoiceWakeEnabled(false)
        return
      }
      setOrbVoiceWakeStatus(event.error === 'network' ? 'connection-error' : 'retrying')
      scheduleRestart(event.error === 'network' ? 3000 : 1200)
    }
    recognition.onend = () => {
      starting = false
      if (wakeRequested) {
        openFromWake()
        return
      }
      scheduleRestart()
    }
    const onVisibilityChange = () => {
      if (document.hidden) {
        setOrbVoiceWakeStatus('paused')
        stop()
      }
      else {
        stopped = false
        start()
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    start()

    return () => {
      mounted = false
      document.removeEventListener('visibilitychange', onVisibilityChange)
      stop()
      recognition.onend = null
      recognition.onerror = null
      recognition.onresult = null
      if (recognitionRef.current === recognition) recognitionRef.current = null
    }
  }, [voiceWakeEnabled, flowPage, open])

  useEffect(() => {
    if (!open || !voiceDictationRequest) return undefined
    // Leave a small gap after the wake listener's `end` event before browser
    // dictation claims the microphone. This avoids intermittent InvalidState
    // errors in Chromium's Web Speech implementation.
    const timer = window.setTimeout(startDictation, 420)
    return () => window.clearTimeout(timer)
  }, [open, voiceDictationRequest, startDictation])

  const ask = async (event) => {
    event?.preventDefault()
    const text = draft.trim()
    if (!text || thinking) return
    setMessages((items) => [...items, { id: makeId(), role: 'user', text }])
    setDraft('')
    setThinking(true)
    try {
      const result = await askOrbGuide({ page_path: currentPath, question: text })
      if (!result?.answer) throw new Error('No guide response')
      const destination = pages[result.navigate_to] ? result.navigate_to : ''
      setMessages((items) => [...items, { id: makeId(), role: 'orb', text: result.answer, destination }])
      if (destination && isNavigationCommand(text)) {
        // Show Orb's acknowledgement briefly, then take the user directly to
        // the validated in-app route. Explanatory questions keep the button.
        window.setTimeout(() => {
          closeGuide()
          navigate(destination)
        }, 420)
      }
    } catch (error) {
      setMessages((items) => [...items, {
        id: makeId(),
        role: 'orb',
        error: true,
        text: error?.message || 'Orb could not reach the AI guide. Please try again.',
      }])
    } finally {
      setThinking(false)
    }
  }

  if (flowPage) return null

  return <div className="fixed bottom-5 right-5 z-[80] sm:bottom-6">
    {open && <section aria-label="Orb workspace guide" className="orb-guide-panel absolute bottom-16 right-0 flex h-[min(35rem,calc(100vh-8rem))] w-[min(23rem,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-2xl border border-primary/15 bg-white shadow-2xl shadow-slate-900/15">
      <header className="flex items-center gap-3 border-b border-slate-200 bg-gradient-to-r from-primary-tint/70 to-white px-4 py-3.5"><span className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full"><Orb colors={['#9c43fe', '#4cc2e9', '#101499']} backgroundColor="#ffffff" size={1.12} glow={1} hoverIntensity={1} trail={1} rotateOnHover followCursor intro /></span><div className="min-w-0"><p className="text-sm font-extrabold text-slate-900">Ask Orb</p><p className="truncate text-[11px] text-slate-500">Guiding you through {current.title}</p></div><button type="button" onClick={closeGuide} aria-label="Close Orb guide" className="ml-auto grid h-8 w-8 place-items-center rounded-lg text-slate-400 transition hover:bg-white hover:text-slate-700"><X size={17} /></button></header>
      <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/70 p-4">
        {messages.length === 0 && !thinking && <div aria-live="polite" className="orb-guide-greeting orb-guide-copy inline-flex rounded-2xl rounded-tl-md border border-slate-200 bg-white px-3 py-2.5 shadow-sm">How may I help you?</div>}
        <div className={messages.length || thinking ? 'space-y-3' : 'mt-5 space-y-3'}>{messages.map((message) => <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : ''}`}><div className={`max-w-[84%] rounded-2xl px-3 py-2.5 shadow-sm ${message.role === 'user' ? 'rounded-br-md bg-primary text-xs leading-5 text-white' : message.error ? 'rounded-bl-md border border-red-200 bg-red-50 text-red-700' : 'orb-guide-copy rounded-bl-md border border-slate-200 bg-white'}`}><p>{message.text}</p>{message.destination && <button type="button" onClick={() => { navigate(message.destination); setOpen(false) }} className="mt-2 inline-flex items-center gap-1 rounded-md bg-primary-tint px-2 py-1 text-[11px] font-bold text-primary transition hover:bg-primary/15">Open {pages[message.destination]?.title}<ArrowUpRight size={13} /></button>}</div></div>)}{thinking && <div aria-live="polite" className="orb-guide-thinking orb-guide-copy inline-flex items-center gap-2 rounded-2xl rounded-bl-md border border-slate-200 bg-white px-3 py-2.5"><span className="orb-guide-thinking__dots" aria-hidden="true"><i /><i /><i /></span>Orb is thinking…</div>}</div>
      </div>
      <form onSubmit={ask} className="orb-guide-prompt border-t border-slate-200 bg-white p-3"><div className={`orb-prompt-field rounded-xl border p-3 transition ${thinking ? 'opacity-70' : ''}`}><textarea ref={inputRef} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); ask(event) } }} disabled={thinking} rows={2} placeholder="" className="block w-full resize-none bg-transparent text-sm leading-5 text-slate-800 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed" />{!draft && !thinking && <span className="orb-prompt-field__typing" aria-hidden="true">{typedPlaceholder}<i /></span>}<div className="mt-3 flex items-center gap-3"><span className="orb-prompt-field__icon" aria-hidden="true"><Plus size={18} /></span><span className="flex-1" /><button type="button" onClick={startDictation} disabled={thinking} aria-label={dictating ? 'Stop dictation' : 'Start dictation'} title={dictating ? 'Stop dictation' : 'Dictate your question'} className={`orb-prompt-field__icon grid h-8 w-8 place-items-center rounded-lg transition hover:bg-primary/10 disabled:cursor-not-allowed ${dictating ? 'bg-primary/10 text-primary' : ''}`}>{dictating ? <MicOff size={16} /> : <Mic size={16} />}</button><button type="submit" aria-label="Ask Orb" disabled={!draft.trim() || thinking} className="orb-prompt-field__send grid h-8 w-8 place-items-center rounded-lg text-white transition disabled:cursor-not-allowed">{thinking ? <Loader2 size={15} className="animate-spin" /> : <ArrowUp size={17} strokeWidth={2.5} />}</button></div></div>{dictationError && <p role="alert" className="px-1 pt-2 text-[11px] font-medium text-red-600">{dictationError}</p>}</form>
    </section>}
    <button type="button" onClick={() => { if (open) closeGuide(); else setOpen(true) }} aria-label={open ? 'Close Orb guide' : 'Open Orb guide'} aria-expanded={open} className="group relative grid h-12 w-12 place-items-center rounded-full transition duration-200 hover:scale-105 focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/25"><span className="absolute inset-0 rounded-full bg-primary/10 blur-md transition group-hover:bg-primary/20" /><span className="relative h-12 w-12 overflow-hidden rounded-full shadow-lg shadow-primary/20"><Orb colors={['#9c43fe', '#4cc2e9', '#101499']} backgroundColor="#ffffff" size={1.12} glow={1} hoverIntensity={1} trail={1} rotateOnHover followCursor intro /></span></button>
  </div>
}

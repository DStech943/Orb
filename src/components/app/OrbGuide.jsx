import React, { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowUp, ArrowUpRight, Loader2, Mic, MicOff, Plus, X } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import Orb from '../Orb'
import { activeBrandName, askOrbGuide, chatWithBrandAgent, draftOrbWork } from '../../services/orbApi'
import { listBrands } from '../../services/brands'
import { listSops } from '../../services/generation'
import { isOrbVoiceWakeEnabled, ORB_VOICE_WAKE_EVENT, setOrbVoiceWakeEnabled, setOrbVoiceWakeStatus } from '../../lib/orbVoiceWake'
import { startBrowserDictation } from '../../lib/browserDictation'

const pages = {
  '/app': { title: 'Overview', summary: "This is your brand's at-a-glance workspace for support activity and content progress." },
  '/app/workspace': { title: 'Brand workspace', summary: 'Use this page to add the brand context Orb needs for support content.' },
  '/app/operations': { title: 'Operations', summary: 'Record customer-support and product updates, then review the follow-up Orb has queued for this brand.' },
  '/app/chat': { title: 'Agent chat', summary: "Use this page to test the selected brand's deployed support agent." },
  '/app/brain': { title: "AI's Brain", summary: 'Review and manage the SOPs and FAQs that give your agent dependable brand knowledge.' },
  '/app/sops': { title: "AI's Brain", summary: 'Use this page to review and manage support operating procedures.' },
  '/app/flows': { title: 'Flows', summary: 'Use this page to build visual support flows or have Orb draft one from a prompt.' },
  '/app/templates': { title: 'Templates', summary: 'Review approved brand message templates and sync new ones from Zoko.' },
  '/app/faqs': { title: "AI's Brain", summary: 'Use this page to review and manage customer-facing questions and answers.' },
  '/app/products': { title: 'Products', summary: 'Use this page to review product knowledge for the support experience.' },
  '/app/tools': { title: 'Tools', summary: 'Use this page to inspect systems, tools, and prerequisites for support work.' },
  '/app/settings': { title: 'Settings', summary: 'Use this page to manage your profile, team access, and app preferences.' },
}

const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
const newAgentSessionId = () => `orb_guide_${typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '') : `${Date.now()}${Math.random().toString(36).slice(2, 12)}`}`.slice(0, 64)
const SOP_DRAFT_HANDOFF_KEY = 'orb:pending-sop-edit'

// Speech recognition frequently transcribes “Orb” as “or” / “orbe”. Keeping
// those common variants here makes the wake phrase more forgiving without
// matching ordinary conversation that does not begin with a greeting.
const WAKE_PHRASE = /\b(?:hey|hi|okay|ok)\s+(?:orb|orbe|or)\b/i
const normalizeSpeech = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const isWakePhraseOnly = (value) => /^(?:hey|hi|okay|ok)\s+(?:orb|orbe|or)$/.test(normalizeSpeech(value))
const isNavigationCommand = (value) => /(?:^\s*(?:please\s+)?(?:go|open|navigate|switch|show|take|bring)\b)|(?:\b(?:go|take|bring)\s+(?:me\s+)?(?:to|on|into)\b)|(?:\b(?:can|could|would)\s+you\s+(?:go|open|navigate|switch|show|take|bring)\b)/i.test(value)
const VOICE_SEND_CUE = /\b(?:orb|orbe)\s*[.!?]*$/i
const actionDestinations = {
  open_agent_chat: '/app/brain?tab=chat',
  open_sops: '/app/brain?tab=sops',
  open_faqs: '/app/brain?tab=faqs',
  open_create_with_orb: '/app/flows?create=orb',
  focus_operational_update: '/app/operations?compose=1',
}
const actionLabels = {
  open_agent_chat: 'agent test chat',
  open_sops: 'SOPs',
  open_faqs: 'FAQs',
  open_create_with_orb: 'Create with Orb',
  focus_operational_update: 'new operational update',
}
const followPreviousDestination = (value) => /^(?:(?:please|can|could|would)\s+(?:you\s+)?)?(?:take me there|take me to it|open (?:that|it)|go (?:there|to it)|show me(?: that)?|yes(?:\s+please)?)\s*[.!?]*$/i.test(String(value || '').trim())
const flowBriefFromRequest = (value) => {
  const request = String(value || '')
    .replace(/\b(?:okay|ok|please|can you|could you|would you)\b/gi, ' ')
    .replace(/\b(?:prompt\s+)?(?:the\s+)?orb\s+to\s+(?:create|build|make|start)\b/gi, ' ')
    .replace(/\b(?:create|build|make|start)\s+(?:a\s+)?(?:new\s+)?flow\b/gi, ' ')
    .replace(/\bfor me\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const subject = request || 'the requested customer-support scenario'
  return `Create an editable customer-support flow for ${subject}. Include a trigger, the details to collect, validation checks, clear outcome branches, customer-facing messages, escalation or handoff where needed, and a completed end state for every branch.`
}
const faqDraftFromRequest = (value) => {
  const answer = String(value || '')
    .replace(/^.*?\b(?:add|create|make)\s+(?:an?\s+)?faq\s*(?:that|saying|for)?\s*/i, '')
    .trim()
  const productMatch = answer.match(/^(.+?)\s+is not made with real cranberries\b/i)
  const question = productMatch
    ? `Is ${productMatch[1].trim()} made with real cranberries or unsafe for people with berry allergies?`
    : 'What should customers know about this update?'
  return { question, answer: answer || String(value || '').trim() }
}
const productDraftFromRequest = (value) => {
  const message = String(value || '').trim()
  const target = message.match(/^\s*(.+?)\s+(?:is|are)\s+(?:out of stock|back in stock|on pre[ -]?order|available again|expected to be back)/i)?.[1]?.trim() || ''
  return { message, target }
}
const operationDraftFromRequest = (value) => {
  const original = String(value || '').trim()
  const draft = original
    .replace(/^.*?\b(?:go|open|navigate|switch|take|bring)\s+(?:me\s+)?(?:to\s+)?operations?\b\s*(?:and|then)?\s*/i, '')
    .replace(/^(?:(?:could|can|would)\s+you\s+|please\s+)?(?:create|make|add|record|draft|write|compose)\s+(?:me\s+)?(?:an?\s+)?(?:new\s+)?operations?\s*(?:(?:uh|um)\s*)?(?:update|note|message)?\s*(?:(?:saying\s+)?(?:that|for)\s*)?/i, '')
    .trim()
  return draft || original
}
const sopPolicyFromRequest = (value) => {
  const request = String(value || '').trim()
  const marker = /\b(?:this is the correct sop|the correct sop is|correct sop|correct version)\b\s*:?\s*/i
  const markerMatch = marker.exec(request)
  if (!markerMatch) return request
  return request.slice((markerMatch.index || 0) + markerMatch[0].length).trim() || request
}
const sopSearchTerms = (value) => {
  const beforePolicy = String(value || '').split(/\b(?:this is the correct sop|the correct sop is|correct sop|correct version)\b/i)[0]
  const target = beforePolicy.match(/\b(?:sop|procedure)\s+(?:for|on|about)?\s*([a-z][a-z\s&/-]*)/i)?.[1] || beforePolicy
  const words = String(target).toLowerCase().match(/[a-z]{3,}/g) || []
  const aliases = /\b(?:refund|return|exchange)\b/i.test(value) ? ['refund', 'return', 'returns', 'exchange', 'exchanges', 'replacement'] : []
  return [...new Set([...words, ...aliases].filter((word) => !['check', 'correct', 'edit', 'update', 'change', 'accordance', 'please', 'sop', 'procedure'].includes(word)))]
}
const matchingSops = (sops, request) => {
  const terms = sopSearchTerms(request)
  return (Array.isArray(sops) ? sops : [])
    .map((sop) => {
      const title = String(sop.title || '').toLowerCase()
      const searchable = [sop.title, sop.category, sop.situation, sop.whatToDo, sop.whatToSay].filter(Boolean).join(' ').toLowerCase()
      const score = terms.reduce((total, term) => total + (title.includes(term) ? 5 : 0) + (searchable.includes(term) ? 1 : 0), 0)
      return { sop, score }
    })
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || String(left.sop.title || '').localeCompare(String(right.sop.title || '')))
    .map(({ sop }) => sop)
}
const sopDraftFromRequest = (sop, request) => {
  const policy = sopPolicyFromRequest(request)
  const isReturnsPolicy = /\b(?:refund|return|exchange)\b/i.test(policy)
  if (!isReturnsPolicy) return { ...sop, whatToDo: policy || sop.whatToDo }
  return {
    ...sop,
    situation: 'A customer asks for a return, refund, exchange, credit note, or replacement.',
    checkFirst: 'Confirm the delivery date and whether the product or packaging is damaged or defective. Confirm that any replacement request is being made within two weeks of delivery.',
    whatToDo: policy,
    whatToSay: 'We do not accept returns or exchanges after delivery, including unopened products, unless the product or packaging is damaged or defective. We cannot offer exchanges based on fragrance preference or issue credit notes. If the product or packaging is damaged or defective, we can arrange a replacement when the request is made within two weeks of delivery.',
  }
}
const assistantWorkFromRequest = (value) => {
  const text = String(value || '').trim()
  const isQuestion = /\?$/.test(text) || /^(?:what|why|how|where|when|who|can|could|would|do|does|is|are)\b/i.test(text)
  const explicitAction = /\b(?:draft|write|compose|create|make|add|record|update|change|edit)\b/i.test(text)
  if (isQuestion && !explicitAction) return null
  if (
    /\b(?:draft|write|compose|create|make|add|record)\b[\s\S]{0,80}\b(?:operations?|operational\s+(?:update|note)|update|note|message)\b/i.test(text)
  ) return { type: 'draft_operation' }
  if (/\b(?:sop|sops|procedure)\b/i.test(text) && /\b(?:check|edit|update|correct|replace|revise|amend|change)\b/i.test(text)) return { type: 'sop_edit' }
  if (/\b(?:add|create|make)\s+(?:an?\s+)?faq\b/i.test(text)) return { type: 'faq' }
  if (/\b(?:out of stock|back in stock|pre[ -]?order|restock|expected to be back)\b/i.test(text)) return { type: 'product' }
  if (/\b(?:delayed|delay|late|running late|sale|promotion|ganesh|diwali|operational note|operations?)\b/i.test(text)) return { type: 'operation' }
  return null
}
const directGuideCommand = (value) => {
  const text = normalizeSpeech(value)
  const asksToCreateFlow = /\b(?:create|build|make|start|new)\b.*\bflow\b/.test(text) || /\bcreate with orb\b/.test(text)
  const asksToWriteUpdate = /\b(?:write|record|add|new)\b.*\b(?:update|operation)\b/.test(text)
  const asksWhereToFindIt = /\b(?:where|which\s+page|find|location|located)\b/.test(text)
  if (!isNavigationCommand(value) && !asksToCreateFlow && !asksToWriteUpdate && !asksWhereToFindIt) return null
  if (asksToCreateFlow) return { action: 'open_create_with_orb', answer: 'I prepared a flow brief and added it to Create with Orb. You can refine it before generating.', flowPrompt: flowBriefFromRequest(value) }
  if (asksToWriteUpdate) return { action: 'focus_operational_update', answer: 'Opening Operations and focusing a new update.' }
  const pageResponse = (destination, label, whereAnswer) => ({
    destination,
    answer: asksWhereToFindIt ? whereAnswer : `Opening ${label}.`,
    autoNavigate: !asksWhereToFindIt,
  })
  if (/\b(?:chat|test).*(?:ai|agent)|\b(?:ai|agent).*(?:chat|test)\b|\b(?:agent\s+)?chat\b/.test(text)) return { action: 'open_agent_chat', answer: asksWhereToFindIt ? "The agent test chat is in AI's Brain." : 'Opening the agent test chat.', autoNavigate: !asksWhereToFindIt }
  if (/\bfaq/.test(text)) return { action: 'open_faqs', answer: asksWhereToFindIt ? "FAQs are in AI's Brain." : 'Opening FAQs.', autoNavigate: !asksWhereToFindIt }
  if (/\b(?:sop|sops)\b/.test(text)) return { action: 'open_sops', answer: asksWhereToFindIt ? "SOPs are in AI's Brain." : 'Opening SOPs.', autoNavigate: !asksWhereToFindIt }
  if (/\b(?:brain|knowledge|knowledge base)\b/.test(text)) return pageResponse('/app/brain', "AI's Brain", "AI's Brain is in the left sidebar.")
  if (/\boperations?\b/.test(text)) return pageResponse('/app/operations', 'Operations', 'Operations is in the left sidebar, below Brand Workspace.')
  if (/\b(?:brand workspace|workspace|brand voice)\b/.test(text)) return pageResponse('/app/workspace', 'Brand Workspace', 'Brand Workspace is in the left sidebar.')
  if (/\bflow/.test(text)) return pageResponse('/app/flows', 'Flows', 'Flows is in the left sidebar.')
  if (/\b(?:message )?templates?\b/.test(text)) return pageResponse('/app/templates', 'Templates', 'Templates is in the left sidebar, below Flows.')
  if (/\bproduct/.test(text)) return pageResponse('/app/products', 'Products', 'Products is in the left sidebar.')
  if (/\b(?:overview|dashboard|home)\b/.test(text)) return pageResponse('/app', 'Overview', 'Overview is the first item in the left sidebar.')
  if (/\b(?:setting|settings)\b/.test(text)) return pageResponse('/app/settings', 'Settings', 'Settings is at the bottom of the left sidebar.')
  if (/\btool/.test(text)) return pageResponse('/app/tools', 'Tools', 'Tools is in the left sidebar.')
  return null
}

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
  const [brandAgentMode, setBrandAgentMode] = useState(false)
  const [activeBrand, setActiveBrand] = useState(null)
  const [agentSessionId, setAgentSessionId] = useState(newAgentSessionId)
  const [voiceWakeEnabled, setVoiceWakeEnabled] = useState(isOrbVoiceWakeEnabled)
  const [dictating, setDictating] = useState(false)
  const [dictationError, setDictationError] = useState('')
  const [voiceDictationRequest, setVoiceDictationRequest] = useState(0)
  const [promptReset, setPromptReset] = useState(0)
  const inputRef = useRef(null)
  const recognitionRef = useRef(null)
  const restartTimerRef = useRef(null)
  const lastWakeRef = useRef(0)
  const dictationRef = useRef(null)
  const resumeWakeAfterDictationRef = useRef(false)
  const closeTimerRef = useRef(null)
  const draftRef = useRef('')
  const askRef = useRef(null)
  const lastDestinationRef = useRef(null)
  const flowPage = location.pathname === '/app/flows'
  const rotatingPrompts = [`What's happening on ${current.title}?`, 'Where do I create a support flow?', 'Where can I test my AI agent?']
  const agentName = String(activeBrand?.ai_agent_name || '').trim() || (activeBrand?.name ? `${activeBrand.name} AI` : 'Brand AI')

  useEffect(() => {
    let live = true
    const loadActiveBrand = async () => {
      try {
        const brands = await listBrands()
        if (!live) return
        const selectedId = window.localStorage.getItem('orb_selected_brand') || ''
        setActiveBrand(brands.find((brand) => brand.id === selectedId) || brands[0] || null)
      } catch { if (live) setActiveBrand(null) }
    }
    loadActiveBrand()
    window.addEventListener('orb:brand-changed', loadActiveBrand)
    return () => { live = false; window.removeEventListener('orb:brand-changed', loadActiveBrand) }
  }, [])

  const switchChatMode = (nextBrandAgentMode) => {
    setBrandAgentMode(nextBrandAgentMode)
    setMessages([])
    setDraft('')
    draftRef.current = ''
    setAgentSessionId(newAgentSessionId())
  }

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
      onTranscript: (transcript, isFinal) => {
        const spokenDraft = [base, transcript].filter(Boolean).join(base && transcript ? ' ' : '')
        const shouldSend = Boolean(isFinal && VOICE_SEND_CUE.test(transcript))
        const nextDraft = shouldSend ? spokenDraft.replace(VOICE_SEND_CUE, '').trim() : spokenDraft
        draftRef.current = nextDraft
        setDraft(nextDraft)
        if (shouldSend && nextDraft) {
          dictationRef.current?.stop()
          window.setTimeout(() => askRef.current?.(undefined, nextDraft), 0)
        }
      },
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
        const transcript = result[0]?.transcript?.trim() || ''
        if (!result.isFinal && !isWakePhraseOnly(transcript)) continue
        const normalizedTranscript = normalizeSpeech(transcript)
        const match = normalizedTranscript.match(WAKE_PHRASE)
        if (!match || Date.now() - lastWakeRef.current < 2000) continue
        lastWakeRef.current = Date.now()
        pendingQuestion = normalizedTranscript.slice((match.index || 0) + match[0].length).trim()
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

  const ask = async (event, suppliedText = '') => {
    event?.preventDefault()
    const text = (suppliedText || draftRef.current).trim()
    if (!text || thinking) return
    setMessages((items) => [...items, { id: makeId(), role: 'user', text }])
    draftRef.current = ''
    setDraft('')
    // Clear the browser control too. This prevents a late text-input or
    // speech-recognition event from leaving the just-sent prompt visible.
    if (inputRef.current) inputRef.current.value = ''
    if (brandAgentMode) {
      if (!activeBrand?.id) {
        setMessages((items) => [...items, { id: makeId(), role: 'agent', error: true, text: 'Choose a brand with a connected AI agent first.' }])
        return
      }
      setThinking(true)
      try {
        const result = await chatWithBrandAgent(activeBrand.id, { message: text, session_id: agentSessionId })
        const reply = String(result?.response || result?.reply || '').trim()
        if (!reply) throw new Error(`${agentName} returned no reply.`)
        setMessages((items) => [...items, { id: makeId(), role: 'agent', text: reply }])
      } catch (error) {
        setMessages((items) => [...items, { id: makeId(), role: 'agent', error: true, text: error?.message || `${agentName} could not respond. Please try again.` }])
      } finally {
        setThinking(false)
      }
      return
    }
    setPromptReset((value) => value + 1)
    const requestedWork = assistantWorkFromRequest(text)
    if (requestedWork) {
      const brandName = activeBrandName()
      if (!brandName) {
        setMessages((items) => [...items, { id: makeId(), role: 'orb', error: true, text: 'Choose a brand before I make this change.' }])
        return
      }
      setThinking(true)
      try {
        if (requestedWork.type === 'sop_edit') {
          const matches = matchingSops(await listSops(), text)
          if (!matches.length) {
            setMessages((items) => [...items, { id: makeId(), role: 'orb', error: true, text: 'I could not find an SOP that matches that request. Try the SOP title or a more specific keyword.' }])
            return
          }
          if (matches.length > 1) {
            setMessages((items) => [...items, {
              id: makeId(),
              role: 'orb',
              text: 'I found multiple SOPs that could match. Which one should I prepare as an editable draft?',
              sopChoices: matches.slice(0, 5),
              sopRequest: text,
            }])
            return
          }
          const sop = matches[0]
          const destination = '/app/brain?tab=sops'
          window.sessionStorage.setItem(SOP_DRAFT_HANDOFF_KEY, JSON.stringify({ sopId: sop.id, draft: sopDraftFromRequest(sop, text), createdAt: Date.now() }))
          lastDestinationRef.current = { destination, destinationLabel: 'SOPs' }
          setMessages((items) => [...items, { id: makeId(), role: 'orb', text: `Opening “${sop.title}” with your correction as an unsaved draft. Review and save it when you are ready.`, destination, destinationLabel: 'SOPs' }])
          window.setTimeout(() => navigate(destination), 280)
          return
        }
        if (requestedWork.type === 'draft_operation' || requestedWork.type === 'operation') {
          const prepared = await draftOrbWork({ target: 'operation', request: operationDraftFromRequest(text) })
          const message = prepared?.message || operationDraftFromRequest(text)
          const destination = `/app/operations?compose=1&message=${encodeURIComponent(message || text)}`
          lastDestinationRef.current = { destination, destinationLabel: 'Operations' }
          setMessages((items) => [...items, { id: makeId(), role: 'orb', text: 'Opening Operations with your update drafted and ready to review before sending.', destination, destinationLabel: 'Operations' }])
          window.setTimeout(() => navigate(destination), 280)
          return
        }
        if (requestedWork.type === 'faq') {
          const fallback = faqDraftFromRequest(text)
          const prepared = await draftOrbWork({ target: 'faq', request: text })
          const faq = {
            question: prepared?.question || fallback.question,
            answer: prepared?.answer || fallback.answer,
            category: prepared?.category || 'Product',
          }
          const destination = `/app/brain?tab=faqs&draftQuestion=${encodeURIComponent(faq.question)}&draftAnswer=${encodeURIComponent(faq.answer)}&draftCategory=${encodeURIComponent(faq.category)}`
          lastDestinationRef.current = { destination, destinationLabel: 'FAQs' }
          setMessages((items) => [...items, { id: makeId(), role: 'orb', text: 'Opening an unsaved FAQ draft for you to review. Nothing will be added until you choose Save.', destination, destinationLabel: 'FAQs' }])
          window.setTimeout(() => navigate(destination), 280)
          return
        }
        if (requestedWork.type === 'product') {
          const fallback = productDraftFromRequest(text)
          const prepared = await draftOrbWork({ target: 'product', request: text })
          const productDraft = {
            target: prepared?.target || fallback.target,
            description: prepared?.description || fallback.message,
            fieldHint: prepared?.field_hint || '',
          }
          const destination = `/app/products?draft=${encodeURIComponent(productDraft.description)}${productDraft.target ? `&target=${encodeURIComponent(productDraft.target)}` : ''}${productDraft.fieldHint ? `&field=${encodeURIComponent(productDraft.fieldHint)}` : ''}`
          lastDestinationRef.current = { destination, destinationLabel: 'Products' }
          setMessages((items) => [...items, { id: makeId(), role: 'orb', text: 'Opening Products so you can choose the relevant Shopify field for this unsaved draft. Nothing will be added or saved until you approve it.', destination, destinationLabel: 'Products' }])
          window.setTimeout(() => navigate(destination), 280)
          return
        }
      } catch (error) {
        setMessages((items) => [...items, { id: makeId(), role: 'orb', error: true, text: error?.message || 'I could not complete that change.' }])
        return
      } finally {
        setThinking(false)
      }
    }
    const previousDestination = followPreviousDestination(text) ? lastDestinationRef.current : null
    if (previousDestination?.destination) {
      const acknowledgement = `Opening ${previousDestination.destinationLabel || pages[previousDestination.destination]?.title || 'that page'}.`
      setMessages((items) => [...items, {
        id: makeId(),
        role: 'orb',
        text: acknowledgement,
        destination: previousDestination.destination,
        destinationLabel: previousDestination.destinationLabel,
      }])
      window.setTimeout(() => navigate(previousDestination.destination), 280)
      return
    }
    const directCommand = directGuideCommand(text)
    if (directCommand) {
      const destination = directCommand.destination || actionDestinations[directCommand.action] || ''
      const destinationLabel = actionLabels[directCommand.action] || pages[destination]?.title || ''
      const flowPrompt = directCommand.flowPrompt || ''
      const resolvedDestination = flowPrompt && destination === actionDestinations.open_create_with_orb
        ? `${destination}&prompt=${encodeURIComponent(flowPrompt)}`
        : destination
      if (destination) lastDestinationRef.current = { destination: resolvedDestination, destinationLabel }
      setMessages((items) => [...items, { id: makeId(), role: 'orb', text: directCommand.answer, destination: resolvedDestination, destinationLabel }])
      if (directCommand.autoNavigate !== false) {
        window.setTimeout(() => {
          navigate(resolvedDestination)
        }, 280)
      }
      return
    }
    setThinking(true)
    try {
      const result = await askOrbGuide({ page_path: currentPath, question: text })
      if (!result?.answer) throw new Error('No guide response')
      const action = actionDestinations[result?.action] ? result.action : ''
      const destination = actionDestinations[action] || (pages[result.navigate_to] ? result.navigate_to : '')
      const destinationLabel = actionLabels[action] || pages[destination]?.title || ''
      const flowPrompt = action === 'open_create_with_orb' ? flowBriefFromRequest(text) : ''
      const resolvedDestination = flowPrompt && destination === actionDestinations.open_create_with_orb
        ? `${destination}&prompt=${encodeURIComponent(flowPrompt)}`
        : destination
      if (destination) lastDestinationRef.current = { destination: resolvedDestination, destinationLabel }
      setMessages((items) => [...items, { id: makeId(), role: 'orb', text: result.answer, destination: resolvedDestination, destinationLabel }])
      if (destination && (isNavigationCommand(text) || action)) {
        // Show Orb's acknowledgement briefly, then take the user directly to
        // the validated route without breaking the active conversation.
        window.setTimeout(() => {
          navigate(resolvedDestination)
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

  const openSopDraft = (sop, request) => {
    const destination = '/app/brain?tab=sops'
    window.sessionStorage.setItem(SOP_DRAFT_HANDOFF_KEY, JSON.stringify({ sopId: sop.id, draft: sopDraftFromRequest(sop, request), createdAt: Date.now() }))
    lastDestinationRef.current = { destination, destinationLabel: 'SOPs' }
    setMessages((items) => [...items, { id: makeId(), role: 'orb', text: `Opening “${sop.title}” with your correction as an unsaved draft. Review and save it when you are ready.`, destination, destinationLabel: 'SOPs' }])
    navigate(destination)
  }

  askRef.current = ask

  return <div className="fixed bottom-5 right-5 z-[80] sm:bottom-6">
    {open && <section aria-label="Orb workspace guide" className="orb-guide-panel absolute bottom-16 right-0 flex h-[min(35rem,calc(100vh-8rem))] w-[min(23rem,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-2xl border border-primary/15 bg-white shadow-2xl shadow-slate-900/15">
      <header className="flex items-center gap-3 border-b border-slate-200 bg-gradient-to-r from-primary-tint/70 to-white px-4 py-3.5"><span className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full"><Orb colors={['#9c43fe', '#4cc2e9', '#101499']} backgroundColor="#ffffff" size={1.12} glow={1} hoverIntensity={1} trail={1} rotateOnHover followCursor intro /></span><div className="min-w-0 flex-1"><div className="flex items-center gap-1.5"><p className="text-sm font-extrabold text-slate-900">{brandAgentMode ? `Ask ${agentName}` : 'Ask Orb'}</p><div className="flex rounded-md border border-slate-200 bg-white/80 p-0.5 text-[9px] font-bold"><button type="button" onClick={() => switchChatMode(false)} className={`rounded px-1.5 py-0.5 transition ${!brandAgentMode ? 'bg-primary text-white' : 'text-slate-500 hover:text-slate-800'}`}>Orb</button><button type="button" onClick={() => switchChatMode(true)} disabled={!activeBrand?.id} className={`max-w-20 truncate rounded px-1.5 py-0.5 transition disabled:opacity-40 ${brandAgentMode ? 'bg-primary text-white' : 'text-slate-500 hover:text-slate-800'}`}>{agentName}</button></div></div><p className="truncate text-[11px] text-slate-500">{brandAgentMode ? `Testing ${agentName} for ${activeBrand?.name || 'this brand'}` : `Guiding you through ${current.title}`}</p></div><button type="button" onClick={closeGuide} aria-label="Close Orb guide" className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 transition hover:bg-white hover:text-slate-700"><X size={17} /></button></header>
      <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/70 p-4">
        {messages.length === 0 && !thinking && <div aria-live="polite" className="orb-guide-greeting orb-guide-copy inline-flex rounded-2xl rounded-tl-md border border-slate-200 bg-white px-3 py-2.5 shadow-sm">How may I help you?</div>}
        <div className={messages.length || thinking ? 'space-y-3' : 'mt-5 space-y-3'}>{messages.map((message) => <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : ''}`}><div className={`max-w-[84%] rounded-2xl px-3 py-2.5 shadow-sm ${message.role === 'user' ? 'rounded-br-md bg-primary text-xs leading-5 text-white' : message.error ? 'rounded-bl-md border border-red-200 bg-red-50 text-red-700' : 'orb-guide-copy rounded-bl-md border border-slate-200 bg-white'}`}><p>{message.text}</p>{message.destination && <button type="button" onClick={() => navigate(message.destination)} className="mt-2 inline-flex items-center gap-1 rounded-md bg-primary-tint px-2 py-1 text-[11px] font-bold text-primary transition hover:bg-primary/15">Open {message.destinationLabel || pages[message.destination]?.title || 'page'}<ArrowUpRight size={13} /></button>}{message.sopChoices?.length ? <div className="mt-2 grid gap-1.5">{message.sopChoices.map((sop) => <button key={sop.id} type="button" onClick={() => openSopDraft(sop, message.sopRequest)} className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-left text-xs transition hover:border-primary/40 hover:bg-primary-tint"><span className="block font-bold text-slate-800">{sop.title}</span>{sop.category ? <span className="mt-0.5 block text-[10px] text-slate-500">{sop.category}</span> : null}</button>)}</div> : null}</div></div>)}{thinking && <div aria-live="polite" className="orb-guide-thinking orb-guide-copy inline-flex items-center gap-2 rounded-2xl rounded-bl-md border border-slate-200 bg-white px-3 py-2.5"><span className="orb-guide-thinking__dots" aria-hidden="true"><i /><i /><i /></span>Orb is thinking…</div>}</div>
      </div>
      <form onSubmit={ask} className="orb-guide-prompt border-t border-slate-200 bg-white p-3"><div className={`orb-prompt-field rounded-xl border p-3 transition ${thinking ? 'opacity-70' : ''}`}><textarea key={promptReset} ref={inputRef} value={draft} onChange={(event) => { draftRef.current = event.target.value; setDraft(event.target.value) }} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); ask(event) } }} disabled={thinking} rows={2} placeholder="" className="block w-full resize-none bg-transparent text-sm leading-5 text-slate-800 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed" />{!draft && !thinking && <span className="orb-prompt-field__typing" aria-hidden="true">{typedPlaceholder}<i /></span>}<div className="mt-3 flex items-center gap-3"><span className="orb-prompt-field__icon" aria-hidden="true"><Plus size={18} /></span><span className="flex-1" /><button type="button" onClick={startDictation} disabled={thinking} aria-label={dictating ? 'Stop dictation' : 'Start dictation'} title={dictating ? 'Stop dictation' : 'Dictate your question'} className={`orb-prompt-field__icon grid h-8 w-8 place-items-center rounded-lg transition hover:bg-primary/10 disabled:cursor-not-allowed ${dictating ? 'bg-primary/10 text-primary' : ''}`}>{dictating ? <MicOff size={16} /> : <Mic size={16} />}</button><button type="submit" aria-label="Ask Orb" disabled={!draft.trim() || thinking} className="orb-prompt-field__send grid h-8 w-8 place-items-center rounded-lg text-white transition disabled:cursor-not-allowed">{thinking ? <Loader2 size={15} className="animate-spin" /> : <ArrowUp size={17} strokeWidth={2.5} />}</button></div></div>{dictationError && <p role="alert" className="px-1 pt-2 text-[11px] font-medium text-red-600">{dictationError}</p>}</form>
    </section>}
    <button type="button" onClick={() => { if (open) closeGuide(); else setOpen(true) }} aria-label={open ? 'Close Orb guide' : 'Open Orb guide'} aria-expanded={open} className="group relative grid h-12 w-12 place-items-center rounded-full transition duration-200 hover:scale-105 focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/25"><span className="absolute inset-0 rounded-full bg-primary/10 blur-md transition group-hover:bg-primary/20" /><span className="relative h-12 w-12 overflow-hidden rounded-full shadow-lg shadow-primary/20"><Orb colors={['#9c43fe', '#4cc2e9', '#101499']} backgroundColor="#ffffff" size={1.12} glow={1} hoverIntensity={1} trail={1} rotateOnHover followCursor intro /></span></button>
  </div>
}

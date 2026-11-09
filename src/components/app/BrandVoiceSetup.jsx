import { useCallback, useEffect, useRef, useState } from 'react'
import { CheckCircle2, FileText, Loader2, PencilLine, Trash2, Upload, Wand2 } from 'lucide-react'
import Button from '../ui/Button'
import Textarea from '../ui/Textarea'
import { useToast } from '../../context/ToastContext'
import { hasOrbApi, approveBrandVoice, createManualBrandVoiceProfile, deleteBrandVoiceSource, generateBrandVoice, getBrandVoice, importBrandVoiceSource, setRemoteBrandProfile } from '../../services/orbApi'

const emptyProfile = { id: '', profile: {}, drafting_prompt: '', status: 'draft' }
const VOICE_TONES = [
  {
    id: 'warm-empathetic',
    title: 'Warm & Empathetic',
    description: 'Thoughtful, reassuring support that makes customers feel heard.',
    traits: ['Warm', 'Empathetic', 'Reassuring'],
    prompt: 'Use a warm, empathetic, and reassuring tone. Acknowledge the customer’s situation before offering clear next steps. Keep language natural, kind, and concise. Avoid sounding scripted, overly casual, or making promises that are not confirmed by the brand’s policies.',
  },
  {
    id: 'clear-helpful',
    title: 'Clear & Helpful',
    description: 'Straightforward answers with practical guidance and no ambiguity.',
    traits: ['Clear', 'Helpful', 'Practical'],
    prompt: 'Write in a clear, helpful, and practical voice. Lead with the answer, then give short, actionable next steps. Use plain language, structured formatting when useful, and avoid filler, jargon, or vague statements.',
  },
  {
    id: 'confident-expert',
    title: 'Confident & Expert',
    description: 'Knowledgeable and composed, without sounding distant or rigid.',
    traits: ['Confident', 'Expert', 'Composed'],
    prompt: 'Use a confident, knowledgeable, and composed tone. Explain information accurately and simply, while remaining approachable. Do not overstate certainty, invent policy details, or use unnecessarily technical language.',
  },
  {
    id: 'bright-playful',
    title: 'Bright & Playful',
    description: 'Upbeat, personable support with restrained, purposeful personality.',
    traits: ['Bright', 'Playful', 'Personable'],
    prompt: 'Use a bright, playful, and personable voice. Keep replies upbeat and human while staying useful and respectful. Light humour or an occasional emoji is fine only when it fits the customer’s tone. Never let playfulness obscure the answer or a policy limitation.',
  },
  {
    id: 'calm-refined',
    title: 'Calm & Refined',
    description: 'Polished, measured communication for a more elevated brand feel.',
    traits: ['Calm', 'Refined', 'Considerate'],
    prompt: 'Use a calm, refined, and considerate voice. Keep each response polished, measured, and easy to read. Choose precise language over hype, remain courteous under pressure, and make next steps feel simple and well considered.',
  },
  {
    id: 'custom',
    title: 'Custom',
    description: 'Paste your existing guidance or write the exact behavior you want.',
    traits: ['Custom', 'Brand-led', 'Editable'],
    prompt: 'Write customer-support replies using the brand voice and rules below. Follow confirmed brand facts and policies, be clear about uncertainty, and never invent commitments. Keep responses concise, helpful, and appropriate for the customer’s situation.',
  },
]

const TONE_GUARDRAILS = `\n\nLANGUAGE & FORMATTING\n- Use short paragraphs and line breaks between distinct ideas; never send a dense wall of text.\n- Put the direct answer or action first, then supporting context, then the next step.\n- Use bullets for multiple choices or requirements. Introduce every link with context; never send a bare URL.\n- Use active voice, plain language, and the customer's name only where it feels natural.\n\nEMOTIONAL MOMENTS\n- For frustration or disappointment: acknowledge first, then explain what you can check or do.\n- For confusion: slow down and give one clear step at a time.\n- For positive messages: respond warmly but briefly before returning to the task.\n\nGUARDRAILS\nFollow confirmed brand facts and policies. Do not invent stock, delivery dates, pricing, refunds, eligibility, results, safety claims, or exceptions. Be transparent about uncertainty and offer the best next action or escalation path. Safety, legal, medical, financial, and policy-sensitive rules take priority over this tone prompt.`
const DETAILED_TONE_PROMPTS = {
  'warm-empathetic': `VOICE & PERSONALITY\nWarm, empathetic, and reassuring. Sound like a thoughtful support specialist who listens before helping: human and kind, never overly familiar, overly emotional, or vague.\n\nRESPONSE APPROACH\n- Acknowledge the customer's situation before offering a solution, especially when they are frustrated, worried, or disappointed.\n- Lead with the clearest helpful answer, then explain the next step in plain language.\n- Take calm ownership: say what you can check, do, or clarify without promising an unconfirmed outcome.\n- Match energy gently: slow down for complaints and keep positive replies warm but brief.\n\nAVOID\nAvoid corporate apologies, stiff policy language, filler, blame, sales pressure, and exaggerated reassurance. Do not say something is resolved, approved, safe, available, or on its way unless it is confirmed.`,
  'clear-helpful': `VOICE & PERSONALITY\nClear, helpful, and practical. Sound like a highly capable guide who respects the customer's time: approachable, never cold; concise, never abrupt.\n\nRESPONSE APPROACH\n- Start with the answer or action the customer needs most.\n- Follow with only the context needed to make that answer useful.\n- Give specific next steps in the order the customer should take them.\n- If more information is needed, explain briefly why and ask focused questions.\n\nAVOID\nAvoid jargon, long introductions, repetition, hedging, vague policy references, and dense walls of text. Never say “I can't help” without offering the best alternative or next action.`,
  'confident-expert': `VOICE & PERSONALITY\nConfident, expert, and composed. Communicate with informed calm: credible enough to build trust, but never clinical, superior, or unnecessarily technical.\n\nRESPONSE APPROACH\n- State what is known clearly, then explain what it means for the customer.\n- Give the reasoning behind an answer when it improves confidence or supports a decision.\n- Distinguish confirmed facts, likely outcomes, and information that needs checking.\n- Recommend the safest appropriate next step instead of making broad assurances.\n\nAVOID\nAvoid overclaiming expertise, certainty, results, compatibility, safety, or policy authority. Do not talk down to customers or make assumptions from incomplete account, order, or product information.`,
  'bright-playful': `VOICE & PERSONALITY\nBright, playful, and personable, with the energy of a helpful human rather than a scripted mascot. Personality should support the answer, never become more important than it.\n\nRESPONSE APPROACH\n- Make the customer feel welcomed, then get to the useful answer quickly.\n- Match positive energy with a short, genuine response; do not overreact.\n- For problems, complaints, damage, or safety concerns, immediately reduce playfulness and lead with empathy and practical help.\n- Use warmth to make next steps feel easy, not to distract from a limitation.\n\nEMOJI RULE\nOne restrained emoji may be used only when it fits the channel, explicit brand rules, and the customer's tone.\n\nAVOID\nAvoid multiple emojis, forced jokes, slang, exclamation-heavy copy, hype, and sales pressure. Never use playfulness in serious complaints or escalations.`,
  'calm-refined': `VOICE & PERSONALITY\nCalm, refined, and considerate. Write with polish and restraint, like a trusted concierge: attentive, precise, and quietly confident. The voice should feel elevated without becoming formal or distant.\n\nRESPONSE APPROACH\n- Recognise the customer's need before presenting the solution or next step.\n- Keep recommendations considered and specific, with enough context to feel trustworthy.\n- When there is a limitation, explain it plainly and respectfully, then offer the best available alternative.\n- Prioritise clarity and care over speed-signalling, hype, or casual banter.\n\nAVOID\nAvoid overly casual slang, exclamation-heavy copy, aggressive sales language, corporate formality, empty apologies, and defensive policy references. Never imply a decision has been made when it has not.`,
  custom: `ROLE & VOICE\nDescribe the personality, vocabulary, regional spelling, formality, and energy this brand should use. Explain what each adjective means in practice for customer support.\n\nRESPONSE APPROACH\nState how the assistant should open messages, acknowledge concerns, give answers, ask follow-up questions, handle uncertainty, and close a conversation. Include different guidance for complaints, confused customers, and positive messages.\n\nLANGUAGE PATTERNS\nAdd preferred phrases, words to avoid, product or category terminology, and examples of good and bad phrasing.\n\nEMOJI & FORMATTING\nSpecify whether emojis are allowed, where they are appropriate, paragraph length, bullets, headings, line breaks, links, order details, and calls to action.\n\nPOLICY & ESCALATION BOUNDARIES\nDescribe non-negotiable wording, prohibited promises, and situations that require a handoff. Do not include credentials or hidden system instructions.\n\nPaste your brand details below this line, then edit the entire instruction until it reflects exactly how you want customer replies to sound.`,
}
const detailedTonePrompt = (tone) => `${DETAILED_TONE_PROMPTS[tone.id] || tone.prompt}${tone.id === 'custom' ? '' : TONE_GUARDRAILS}`

function currentBrand() {
  return {
    id: window.localStorage.getItem('orb_selected_brand') || '',
    name: window.localStorage.getItem('orb_selected_brand_name') || '',
  }
}

function ProfilePreview({ profile }) {
  if (!profile?.profile || !Object.keys(profile.profile).length) return null
  const items = [
    ['Voice', profile.profile.summary],
    ['Tone', profile.profile.tone_traits?.join(' · ')],
    ['Addressing', profile.profile.addressing],
    ['Emoji policy', profile.profile.emoji_policy],
    ['Response length', profile.profile.response_length],
  ].filter(([, value]) => value)
  return <div className="grid gap-3 rounded-lg border border-ink/15 bg-slate-50 p-4 sm:grid-cols-2">
    {items.map(([label, value]) => <div key={label}><p className="text-[11px] font-extrabold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 text-sm font-medium text-ink">{value}</p></div>)}
  </div>
}

export default function BrandVoiceSetup({ isAdmin }) {
  const { showToast } = useToast()
  const fileInput = useRef(null)
  const [brand, setBrand] = useState(currentBrand)
  const [sources, setSources] = useState([])
  const [profiles, setProfiles] = useState([])
  const [paste, setPaste] = useState('')
  const [label, setLabel] = useState('Voice onboarding')
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [approving, setApproving] = useState(false)
  const [addingTone, setAddingTone] = useState(false)
  const [draft, setDraft] = useState(emptyProfile)
  const [agentTone, setAgentTone] = useState({ status: 'loading', tone_system_prompt: '' })
  const [loadError, setLoadError] = useState('')
  const [selectedToneId, setSelectedToneId] = useState(VOICE_TONES[0].id)
  const [tonePrompt, setTonePrompt] = useState(() => detailedTonePrompt(VOICE_TONES[0]))
  const [customGuidance, setCustomGuidance] = useState('')
  const [agentName, setAgentName] = useState('')
  const [savingAgentName, setSavingAgentName] = useState(false)
  const selectedTone = VOICE_TONES.find((tone) => tone.id === selectedToneId) || VOICE_TONES[0]

  const load = useCallback(async (brandId = brand.id) => {
    if (!brandId || !hasOrbApi) return
    setLoading(true)
    setLoadError('')
    try {
      const result = await getBrandVoice(brandId)
      setSources(result?.sources || [])
      const nextProfiles = result?.profiles || []
      setProfiles(nextProfiles)
      const preferred = nextProfiles.find((item) => item.status === 'draft') || nextProfiles.find((item) => item.status === 'approved') || emptyProfile
      const liveTone = result?.agent_tone || { status: 'not_connected', tone_system_prompt: '' }
      setAgentName(String(result?.brand?.ai_agent_name || '').trim())
      const livePrompt = String(liveTone.tone_system_prompt || '').trim()
      setAgentTone(liveTone)
      // The deployed Support Agent is the runtime source of truth. When it
      // already has a prompt, show that exact prompt instead of an older
      // local profile stored by Orb.
      if (liveTone.status === 'connected' && livePrompt) {
        setSelectedToneId('custom')
        setTonePrompt(livePrompt)
        setCustomGuidance('')
        setDraft(preferred.id ? { ...preferred, drafting_prompt: livePrompt } : emptyProfile)
      } else {
        setDraft(preferred)
      }
    } catch (error) {
      // This runs automatically (and React development mode may mount twice),
      // so use one calm inline notice rather than stacking duplicate toasts.
      setLoadError(error.message || 'Could not load brand voice.')
    } finally {
      setLoading(false)
    }
  }, [brand.id, showToast])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const onBrandChange = () => {
      const next = currentBrand()
      setBrand(next)
      setSources([])
      setProfiles([])
      setDraft(emptyProfile)
      setAgentTone({ status: 'loading', tone_system_prompt: '' })
      setAgentName('')
      if (next.id) load(next.id)
    }
    window.addEventListener('orb:brand-changed', onBrandChange)
    return () => window.removeEventListener('orb:brand-changed', onBrandChange)
  }, [load])

  const importSource = async ({ content, kind, sourceLabel }) => {
    if (!brand.id) return showToast('Choose a brand from the top bar first.')
    if (content.trim().length < 10) return showToast('Add more voice material before importing.')
    setImporting(true)
    try {
      await importBrandVoiceSource(brand.id, { content, kind, label: sourceLabel || label })
      setPaste('')
      setLabel('Voice onboarding')
      await load(brand.id)
      showToast('Voice material imported.')
    } catch (error) {
      showToast(error.message || 'Could not import voice material.', 'error')
    } finally {
      setImporting(false)
    }
  }

  const chooseFile = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!/\.(csv|txt|md)$/i.test(file.name)) return showToast('Use a CSV, TXT, or Markdown file for voice onboarding.')
    if (file.size > 100_000) return showToast('Keep each voice file below 100 KB.')
    const content = await file.text()
    await importSource({ content, kind: /\.csv$/i.test(file.name) ? 'csv' : 'paste', sourceLabel: file.name })
  }

  const removeSource = async (sourceId) => {
    try {
      await deleteBrandVoiceSource(brand.id, sourceId)
      await load(brand.id)
      showToast('Voice source removed.')
    } catch (error) {
      showToast(error.message || 'Could not remove voice source.', 'error')
    }
  }

  const generate = async () => {
    if (!sources.length) return showToast('Import voice material first.')
    setGenerating(true)
    try {
      const result = await generateBrandVoice(brand.id)
      setDraft(result.profile)
      await load(brand.id)
      showToast('Voice profile draft generated. Review it before approving.')
    } catch (error) {
      showToast(error.message || 'Could not generate the voice profile.', 'error')
    } finally {
      setGenerating(false)
    }
  }

  const approve = async () => {
    if (!draft.id || !draft.drafting_prompt.trim()) return
    setApproving(true)
    try {
      const result = await approveBrandVoice(brand.id, draft.id, { profile: draft.profile, drafting_prompt: draft.drafting_prompt })
      setDraft(result.profile)
      await load(brand.id)
      showToast('Brand voice approved and ready for new SOP and FAQ drafts.')
    } catch (error) {
      showToast(error.message || 'Could not approve the voice profile.', 'error')
    } finally {
      setApproving(false)
    }
  }

  const chooseTone = (tone) => {
    setSelectedToneId(tone.id)
    setTonePrompt(detailedTonePrompt(tone))
    if (tone.id !== 'custom') setCustomGuidance('')
  }

  const addToneToBrand = async () => {
    if (!brand.id) return showToast('Choose a brand from the top bar first.')
    if (tonePrompt.trim().length < 40) return showToast('Write at least a short voice prompt before adding it.')
    setAddingTone(true)
    try {
      const profile = {
        summary: selectedTone.id === 'custom' ? 'Custom brand voice' : selectedTone.description,
        tone_traits: selectedTone.traits,
        style_rules: [tonePrompt.trim(), ...(customGuidance.trim() ? [customGuidance.trim()] : [])],
        addressing: 'Address customers directly, naturally, and respectfully.',
        emoji_policy: selectedTone.id === 'bright-playful' ? 'Use sparingly, only when it matches the customer’s tone.' : 'Use only when explicitly appropriate for the brand.',
        response_length: 'Concise, with enough detail to make the next step clear.',
      }
      const result = await createManualBrandVoiceProfile(brand.id, { profile, drafting_prompt: tonePrompt.trim() })
      setDraft(result.profile)
      await load(brand.id)
      showToast('Brand tonality updated and ready for drafting.')
    } catch (error) {
      showToast(error.message || 'Could not add this brand tonality.', 'error')
    } finally {
      setAddingTone(false)
    }
  }

  const saveAgentName = async (event) => {
    event.preventDefault()
    if (!brand.id || savingAgentName) return
    setSavingAgentName(true)
    try {
      const result = await setRemoteBrandProfile(brand.id, { ai_agent_name: agentName.trim() })
      const savedName = String(result?.brand?.ai_agent_name || '').trim()
      setAgentName(savedName)
      window.localStorage.setItem('orb_selected_brand_agent_name', savedName)
      window.dispatchEvent(new CustomEvent('orb:brand-changed', { detail: { id: brand.id, name: brand.name, ai_agent_name: savedName } }))
      showToast(savedName ? `Agent name updated to ${savedName}.` : 'Agent name cleared. Chat with AI will be used.')
    } catch (error) {
      showToast(error.message || 'Could not save the agent name.', 'error')
    } finally {
      setSavingAgentName(false)
    }
  }

  if (!isAdmin) return <p className="rounded-md border border-ink/15 bg-peach p-3 text-sm text-muted">An administrator can import and approve the brand voice used for drafting.</p>
  if (!hasOrbApi) return <p className="rounded-md border border-ink/15 bg-peach p-3 text-sm text-muted">Start the Orb backend to import and approve a brand voice.</p>

  return <section className="grid max-w-3xl gap-6">
    <div>
      <p className="text-xs font-extrabold uppercase tracking-widest text-purple">Brand voice</p>
      <h3 className="mt-1 text-xl font-extrabold">How should Orb sound?</h3>
      <p className="mt-1 text-sm text-muted">Import your onboarding answers, style guide, or Google Form CSV. Orb creates a compact draft for your review; only the approved version is used in new SOP and FAQ drafts.</p>
      <p className="mt-2 text-xs font-bold text-purple">Active brand: {brand.name || 'Choose a brand in the top bar'}</p>
    </div>

    {loadError && <div role="alert" className="animate-page-in rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">{loadError}</div>}

    <form onSubmit={saveAgentName} className="rounded-xl border border-ink/15 bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-extrabold uppercase tracking-widest text-purple">Agent identity</p>
          <h4 className="mt-1 text-lg font-extrabold">What should your AI be called?</h4>
          <p className="mt-1 text-sm text-muted">This name appears in Chat with AI and is separate from the brand voice prompt.</p>
          <label className="mt-4 block text-sm font-bold" htmlFor="brand-agent-display-name">Agent display name</label>
          <input id="brand-agent-display-name" value={agentName} onChange={(event) => setAgentName(event.target.value)} maxLength={120} placeholder="e.g. Maya AI" className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal outline-none transition focus:border-purple focus:ring-2 focus:ring-purple/15" />
        </div>
        <Button type="submit" variant="purple" size="sm" disabled={savingAgentName || !brand.id}>{savingAgentName ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}Save name</Button>
      </div>
    </form>

    <section className="rounded-xl border border-ink/15 bg-slate-50 p-4 sm:p-5">
      <div><p className="text-xs font-extrabold uppercase tracking-widest text-purple">Brand tonality</p><h4 className="mt-1 text-lg font-extrabold">Choose how your brand should sound</h4><p className="mt-1 text-sm text-muted">Start with one of five editable tonal directions, or create a custom one. The prompt you save becomes the live instruction used by this brand’s Support Agent.</p></div>
      {agentTone.status === 'connected' && <p className="mt-3 inline-flex rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700">Connected to the live Support Agent — showing its current tone prompt.</p>}
      {agentTone.status === 'not_connected' && <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">The Support Agent is not connected yet. Add its control-token connection before saving a live tonality change.</p>}
      {agentTone.status === 'unavailable' && <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">Orb could not read the live Support Agent prompt. The saved Orb profile is shown until the connection is available again.</p>}
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {VOICE_TONES.map((tone) => <button type="button" key={tone.id} onClick={() => chooseTone(tone)} aria-pressed={selectedToneId === tone.id} className={`rounded-xl border bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-primary/45 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 ${selectedToneId === tone.id ? 'border-primary ring-2 ring-primary/15' : 'border-slate-200'}`}>
          <div className="flex items-start justify-between gap-3"><div><h5 className="font-extrabold text-ink">{tone.title}</h5><p className="mt-1 text-xs leading-5 text-muted">{tone.description}</p></div><span className={`mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full ${selectedToneId === tone.id ? 'bg-primary' : 'bg-slate-200'}`} /></div>
          <div className="mt-4 flex flex-wrap gap-1.5">{tone.traits.map((trait) => <span key={trait} className="rounded-full bg-primary-tint px-2 py-1 text-[10px] font-bold text-primary">{trait}</span>)}</div>
        </button>)}
      </div>
      <div className="mt-5 rounded-xl border border-primary/20 bg-white p-4">
        <div className="flex items-center gap-2"><PencilLine size={16} className="text-primary" /><h5 className="font-extrabold">Edit {selectedTone.title} prompt</h5></div>
        <p className="mt-1 text-sm text-muted">Adjust the instruction before adding it to the brand. Your edits are saved exactly as written.</p>
        <Textarea className="mt-4" label="Drafting instruction" value={tonePrompt} onChange={(event) => setTonePrompt(event.target.value)} placeholder="Describe how the support agent should sound and respond…" />
        {selectedTone.id === 'custom' && <Textarea className="mt-4" label="Your brand details" value={customGuidance} onChange={(event) => setCustomGuidance(event.target.value)} placeholder="Paste tone examples, do/don’t rules, preferred phrases, or any other guidance…" />}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-muted">This replaces the currently active brand tonality after saving.</p><Button variant="purple" size="sm" onClick={addToneToBrand} disabled={addingTone || !brand.id || tonePrompt.trim().length < 40}>{addingTone ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}Add to brand tonality</Button></div>
      </div>
    </section>

    <div className="rounded-lg border border-ink/15 bg-peach p-4">
      <p className="font-extrabold">Import onboarding material</p>
      <p className="mt-1 text-sm text-muted">Paste a voice guide or upload a Google Form CSV, TXT, or Markdown export. Raw material is sent to the configured model only when you select Generate voice profile.</p>
      <input className="mt-4 w-full rounded-md border-2 border-ink bg-white px-3 py-2 text-sm" value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Source label" />
      <Textarea className="mt-3" label="Paste voice guidelines" value={paste} onChange={(event) => setPaste(event.target.value)} placeholder="Paste brand adjectives, preferred wording, examples, do/don't rules, or your full onboarding response…" />
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="purple" size="sm" onClick={() => importSource({ content: paste, kind: 'paste' })} disabled={importing || !brand.id}>{importing ? <Loader2 size={15} className="animate-spin" /> : <FileText size={15} />}Import pasted text</Button>
        <Button variant="outline" size="sm" onClick={() => fileInput.current?.click()} disabled={importing || !brand.id}><Upload size={15} />Upload CSV / TXT / MD</Button>
        <input ref={fileInput} className="hidden" type="file" accept=".csv,.txt,.md,text/csv,text/plain,text/markdown" onChange={chooseFile} />
      </div>
    </div>

    <div>
      <div className="flex items-center justify-between gap-3"><div><h4 className="font-extrabold">Imported material</h4><p className="text-sm text-muted">You can remove an outdated source before generating.</p></div>{loading && <Loader2 size={16} className="animate-spin text-purple" />}</div>
      {sources.length ? <ul className="mt-3 divide-y rounded-lg border border-ink/15 bg-white">{sources.map((source) => <li key={source.id} className="flex items-center gap-3 px-4 py-3"><FileText size={16} className="text-purple" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{source.label}</p><p className="text-xs text-muted">{source.kind.toUpperCase()} · {source.characters.toLocaleString()} characters</p></div><button type="button" aria-label={`Remove ${source.label}`} className="rounded p-2 text-slate-500 hover:bg-red-50 hover:text-red-700" onClick={() => removeSource(source.id)}><Trash2 size={16} /></button></li>)}</ul> : <p className="mt-3 rounded-lg border border-dashed border-ink/20 p-4 text-sm text-muted">No voice material has been imported for this brand.</p>}
    </div>

    <div className="flex flex-wrap items-center gap-3 border-t border-ink/15 pt-5">
      <Button variant="purple" onClick={generate} disabled={generating || !sources.length}>{generating ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}Generate voice profile</Button>
      {profiles.find((item) => item.status === 'approved') && <span className="inline-flex items-center gap-1.5 text-sm font-bold text-emerald-700"><CheckCircle2 size={16} />An approved voice is active</span>}
    </div>

    {draft.id && <section className="rounded-xl border-2 border-ink bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-extrabold uppercase tracking-widest text-purple">{draft.status === 'approved' ? 'Active voice profile' : 'Review draft'}</p><h4 className="mt-1 text-lg font-extrabold">Drafting prompt</h4></div><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${draft.status === 'approved' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{draft.status}</span></div>
      <div className="mt-4"><ProfilePreview profile={draft} /></div>
      <Textarea className="mt-4" label="Approved voice prompt" value={draft.drafting_prompt} onChange={(event) => setDraft({ ...draft, drafting_prompt: event.target.value })} />
      {draft.status !== 'approved' && <Button variant="purple" className="mt-4" onClick={approve} disabled={approving || !draft.drafting_prompt.trim()}>{approving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}Approve voice for drafting</Button>}
    </section>}
  </section>
}

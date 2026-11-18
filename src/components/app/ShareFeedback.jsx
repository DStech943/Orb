import React, { useRef, useState } from 'react'
import { LifeBuoy, Loader2, Paperclip, X } from 'lucide-react'
import Avatar from '../ui/Avatar'
import Button from '../ui/Button'
import Modal from '../ui/Modal'
import Textarea from '../ui/Textarea'
import Tooltip from '../ui/Tooltip'
import { useBrand } from '../../context/BrandContext'
import { useToast } from '../../context/ToastContext'
import { sendSlackEscalation } from '../../services/orbApi'

/** "Get help" — shares a note (and optional files) with the team for the active brand. */
export default function ShareFeedback() {
  const { showToast } = useToast()
  const { brandName } = useBrand()
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [files, setFiles] = useState([])
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const fileRef = useRef(null)

  const close = () => {
    if (!sending) {
      setOpen(false)
      setError('')
    }
  }
  const addFiles = (event) => {
    const selected = Array.from(event.target.files || [])
    setFiles((current) => [...current, ...selected].slice(0, 5))
    event.target.value = ''
  }
  const submit = async (event) => {
    event.preventDefault()
    if (!message.trim()) {
      setError('Write a message before sharing it with the team.')
      return
    }
    if (!brandName) {
      setError('Choose a brand before sharing feedback.')
      return
    }
    setSending(true)
    setError('')
    try {
      await sendSlackEscalation({ message, files }, brandName)
      showToast(`Feedback shared with the ${brandName} team.`)
      setMessage('')
      setFiles([])
      setOpen(false)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not share the feedback.')
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <Tooltip label="Get help from the team" side="bottom">
        <button
          type="button"
          className="grid h-9 w-9 place-items-center rounded-lg border border-line bg-white text-fg-muted shadow-card transition-colors hover:border-primary/40 hover:text-primary"
          aria-label="Share feedback with the team"
          onClick={() => {
            setError('')
            setOpen(true)
          }}
        >
          <LifeBuoy size={17} />
        </button>
      </Tooltip>
      <Modal open={open} onClose={close} title="Get help from the team" description="Tell us what needs attention. A real person will take a look.">
        <form className="grid gap-4" onSubmit={submit}>
          <div className="flex items-center gap-3 rounded-xl border border-line bg-canvas p-3">
            <Avatar name={brandName} shape="lg" className="h-9 w-9" />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{brandName || 'No brand selected'}</p>
              <p className="text-xs text-fg-muted">This message is shared for this brand workspace.</p>
            </div>
          </div>
          <Textarea
            label="What needs attention?"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Describe the issue, feedback, and any useful context…"
            disabled={sending}
          />
          <div className="grid gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">
                Media or files <span className="font-normal text-fg-muted">(optional)</span>
              </p>
              <input ref={fileRef} className="sr-only" id="team-feedback-files" type="file" multiple accept="image/*,video/*,audio/*,application/pdf" onChange={addFiles} disabled={sending} />
              <label htmlFor="team-feedback-files" className="inline-flex h-8 cursor-pointer items-center gap-2 rounded-control border border-line-strong bg-white px-3 text-xs font-medium shadow-card transition-colors hover:bg-subtle">
                <Paperclip size={14} />
                Attach
              </label>
            </div>
            {files.length > 0 && (
              <ul className="grid gap-2">
                {files.map((file, index) => (
                  <li key={`${file.name}-${file.lastModified}-${index}`} className="flex items-center justify-between gap-3 rounded-lg border border-line bg-white px-3 py-2 text-xs">
                    <span className="min-w-0 truncate font-medium">{file.name}</span>
                    <button type="button" className="shrink-0 text-fg-muted hover:text-ink" aria-label={`Remove ${file.name}`} onClick={() => setFiles((items) => items.filter((_, itemIndex) => itemIndex !== index))}>
                      <X size={16} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-fg-muted">Up to 5 files, 10 MB each. Images, video, audio, and PDFs are supported.</p>
          </div>
          {error && (
            <p role="alert" className="rounded-lg bg-danger-tint px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2 border-t border-line pt-4">
            <Button type="button" variant="secondary" onClick={close} disabled={sending}>
              Cancel
            </Button>
            <Button type="submit" disabled={!message.trim()} loading={sending}>
              {sending ? 'Sharing…' : 'Share with team'}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  )
}

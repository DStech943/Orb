import React, { useId, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  Check,
  Download,
  FileSpreadsheet,
  FileText,
  Loader2,
  Plus,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import Modal from '../ui/Modal'
import Button from '../ui/Button'
import Select from '../ui/Select'
import { bulkUploadKnowledge } from '../../services/generation'
import { useToast } from '../../context/ToastContext'

// Quote-aware CSV/TSV parser supporting multiline fields and commas/tabs within quotes
export function parseDelimitedText(text) {
  if (!text || !text.trim()) return []
  const firstLine = text.split(/\r\n|\n|\r/)[0] || ''
  const tabCount = (firstLine.match(/\t/g) || []).length
  const commaCount = (firstLine.match(/,/g) || []).length
  const semicolonCount = (firstLine.match(/;/g) || []).length
  const delimiter =
    tabCount > commaCount && tabCount > semicolonCount
      ? '\t'
      : semicolonCount > commaCount
      ? ';'
      : ','

  const rows = []
  let row = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    const nextChar = text[i + 1]

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        field += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === delimiter && !inQuotes) {
      row.push(field.trim())
      field = ''
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') i++
      row.push(field.trim())
      if (row.some((cell) => cell !== '')) {
        rows.push(row)
      }
      row = []
      field = ''
    } else {
      field += char
    }
  }

  if (field !== '' || row.length > 0) {
    row.push(field.trim())
    if (row.some((cell) => cell !== '')) {
      rows.push(row)
    }
  }

  return rows
}

const FAQ_SAMPLE_CSV = `Question,Answer,Category
"How do I track my order?","You can track your order using the tracking link sent to your email after shipment.","Orders"
"What is your return policy?","We accept returns within 30 days of purchase for unused items in original packaging.","Returns"
"Do you ship internationally?","Yes, we ship to over 50 countries worldwide. Delivery typically takes 7-14 business days.","Shipping"`

const SOP_SAMPLE_CSV = `Title,Situation,Check First,What To Do,What To Say,Escalate To,Category
"Damaged Item in Transit","Customer received a broken or leaking item","Ask for clear photos of the damage and order confirmation number","1. Verify photos. 2. Create a free replacement order immediately in Shopify. 3. Email customer confirmation.","I am so sorry about that! I have dispatched a complimentary replacement for you immediately.","Warehouse lead if recurrent","Support"
"Order Cancellation Request","Customer requests to cancel before order ships","Check fulfillment status in Shopify","If unfulfilled, cancel the order and process a full refund. If fulfilled, explain our return procedure.","Your order has been canceled and your refund has been initiated to your original payment method.","None","Billing"`

export default function BulkUploadModal({
  open,
  onClose,
  kind = 'faq',
  onSuccess,
}) {
  const isFaq = kind === 'faq'
  const { showToast } = useToast()
  const fileInputRef = useRef(null)

  const [mode, setMode] = useState('file') // 'file' | 'paste'
  const [file, setFile] = useState(null)
  const [pastedText, setPastedText] = useState('')
  const [defaultCategory, setDefaultCategory] = useState(
    isFaq ? 'Customer support' : 'Support'
  )
  const [defaultStatus, setDefaultStatus] = useState('Draft')
  const [removedIndexes, setRemovedIndexes] = useState(() => new Set())
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  const activeContent = mode === 'file' ? (file?.content || '') : pastedText

  // Parse rows whenever activeContent changes
  const { items: parsedItems, skippedCount } = useMemo(() => {
    if (!activeContent.trim()) {
      return { items: [], skippedCount: 0 }
    }

    const rawRows = parseDelimitedText(activeContent)
    if (!rawRows.length) return { items: [], skippedCount: 0 }

    const header = rawRows[0].map((h) => String(h || '').trim().toLowerCase())

    let startIndex = 0
    let isHeaderDetected = false

    if (isFaq) {
      isHeaderDetected = header.some((col) =>
        /^(question|q|prompt|faq|title|answer|a|response|reply|category)$/i.test(
          col
        )
      )
    } else {
      isHeaderDetected = header.some((col) =>
        /^(title|name|sop|situation|scenario|check.*first|what.*do|what.*say|actions|escalate.*to|category)$/i.test(
          col
        )
      )
    }

    let colMap = {}
    if (isHeaderDetected) {
      startIndex = 1
      header.forEach((name, idx) => {
        if (isFaq) {
          if (/^(question|q|prompt|faq|query)$/i.test(name)) colMap.question = idx
          else if (/^(answer|a|response|reply|solution|body)$/i.test(name))
            colMap.answer = idx
          else if (/^(category|cat|topic|type)$/i.test(name))
            colMap.category = idx
        } else {
          if (/^(title|name|sop|sop.*title)$/i.test(name)) colMap.title = idx
          else if (/^(situation|scenario|condition|trigger)$/i.test(name))
            colMap.situation = idx
          else if (/^(check.*first|checks|prereq.*)$/i.test(name))
            colMap.checkFirst = idx
          else if (/^(what.*do|actions|steps|procedure|instruction)$/i.test(name))
            colMap.whatToDo = idx
          else if (/^(what.*say|script|message|template)$/i.test(name))
            colMap.whatToSay = idx
          else if (/^(escalate.*to|escalate|handoff)$/i.test(name))
            colMap.escalateTo = idx
          else if (/^(category|cat|topic)$/i.test(name)) colMap.category = idx
        }
      })
    } else {
      // Default positional fallback
      if (isFaq) {
        colMap = { question: 0, answer: 1, category: 2 }
      } else {
        colMap = {
          title: 0,
          situation: 1,
          checkFirst: 2,
          whatToDo: 3,
          whatToSay: 4,
          escalateTo: 5,
          category: 6,
        }
      }
    }

    const items = []
    let skipped = 0

    for (let i = startIndex; i < rawRows.length; i++) {
      const row = rawRows[i]
      if (!row || !row.length || row.every((c) => !c.trim())) continue

      if (isFaq) {
        const question =
          colMap.question !== undefined ? String(row[colMap.question] || '').trim() : ''
        const answer =
          colMap.answer !== undefined ? String(row[colMap.answer] || '').trim() : ''
        const category =
          colMap.category !== undefined && row[colMap.category]
            ? String(row[colMap.category]).trim()
            : defaultCategory

        if (!question || !answer) {
          skipped++
          continue
        }

        items.push({
          question,
          answer,
          category: category || defaultCategory,
          status: defaultStatus,
        })
      } else {
        const title =
          colMap.title !== undefined ? String(row[colMap.title] || '').trim() : ''
        const situation =
          colMap.situation !== undefined
            ? String(row[colMap.situation] || '').trim()
            : title
        const checkFirst =
          colMap.checkFirst !== undefined
            ? String(row[colMap.checkFirst] || '').trim()
            : ''
        const whatToDo =
          colMap.whatToDo !== undefined
            ? String(row[colMap.whatToDo] || '').trim()
            : ''
        const whatToSay =
          colMap.whatToSay !== undefined
            ? String(row[colMap.whatToSay] || '').trim()
            : ''
        const escalateTo =
          colMap.escalateTo !== undefined
            ? String(row[colMap.escalateTo] || '').trim()
            : ''
        const category =
          colMap.category !== undefined && row[colMap.category]
            ? String(row[colMap.category]).trim()
            : defaultCategory

        if (!title && !whatToDo) {
          skipped++
          continue
        }

        items.push({
          title: title || situation || 'Untitled SOP',
          situation: situation || title || '',
          checkFirst,
          whatToDo: whatToDo || situation,
          whatToSay,
          escalateTo,
          category: category || defaultCategory,
          status: defaultStatus,
        })
      }
    }

    return { items, skippedCount: skipped }
  }, [activeContent, defaultCategory, defaultStatus, isFaq])

  const visibleItems = useMemo(
    () => parsedItems.filter((_, idx) => !removedIndexes.has(idx)),
    [parsedItems, removedIndexes]
  )

  const handleFileChange = (e) => {
    const selected = e.target.files?.[0]
    if (!selected) return
    setError('')
    const reader = new FileReader()
    reader.onload = (event) => {
      setFile({
        name: selected.name,
        size: selected.size,
        content: event.target.result,
      })
      setRemovedIndexes(new Set())
    }
    reader.onerror = () => {
      setError('Could not read the selected file.')
    }
    reader.readAsText(selected)
  }

  const handleDownloadSample = () => {
    const csvContent = isFaq ? FAQ_SAMPLE_CSV : SOP_SAMPLE_CSV
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', isFaq ? 'faq_template.csv' : 'sop_template.csv')
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const handleInsertSample = () => {
    setPastedText(isFaq ? FAQ_SAMPLE_CSV : SOP_SAMPLE_CSV)
    setRemovedIndexes(new Set())
    setError('')
  }

  const handleClear = () => {
    setFile(null)
    setPastedText('')
    setRemovedIndexes(new Set())
    setError('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleRemoveItem = (index) => {
    setRemovedIndexes((prev) => {
      const next = new Set(prev)
      next.add(index)
      return next
    })
  }

  const handleUpload = async () => {
    if (!visibleItems.length) {
      setError(`Please provide valid ${isFaq ? 'FAQs' : 'SOPs'} to import.`)
      return
    }

    setUploading(true)
    setError('')

    try {
      const kindKey = isFaq ? 'faqs' : 'sops'
      const payloadItems = visibleItems.map((item) => ({
        ...item,
        status: defaultStatus,
        category: item.category || defaultCategory,
      }))

      const result = await bulkUploadKnowledge(kindKey, payloadItems)
      const count = result?.created ?? payloadItems.length
      const published = result?.published ?? 0
      if (published > 0) {
        showToast(
          `Imported ${count} ${isFaq ? (count === 1 ? 'FAQ' : 'FAQs') : (count === 1 ? 'SOP' : 'SOPs')} and published to Qdrant.`
        )
      } else if (defaultStatus === 'Draft') {
        showToast(
          `Imported ${count} ${isFaq ? (count === 1 ? 'FAQ draft' : 'FAQ drafts') : (count === 1 ? 'SOP draft' : 'SOP drafts')}. Click "Approve all drafts" to publish them to Qdrant.`
        )
      } else {
        showToast(
          `Successfully imported ${count} ${isFaq ? (count === 1 ? 'FAQ' : 'FAQs') : (count === 1 ? 'SOP' : 'SOPs')}.`
        )
      }
      if (onSuccess) onSuccess()
      onClose()
    } catch (err) {
      setError(err?.message || `Failed to import ${isFaq ? 'FAQs' : 'SOPs'}.`)
    } finally {
      setUploading(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => !uploading && onClose()}
      title={`Bulk upload ${isFaq ? 'FAQs' : 'SOPs'}`}
      maxWidth="max-w-3xl"
    >
      <div className="space-y-5">
        {/* Subtitle & Method switch tabs */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
          <p className="text-xs text-slate-500">
            Import multiple items by uploading a CSV/TSV file or pasting data directly
            from Excel, Google Sheets, or text.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleDownloadSample}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline"
              title="Download sample template"
            >
              <Download size={14} />
              Sample CSV
            </button>
          </div>
        </div>

        {/* Input Mode Selector */}
        <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-1">
          <button
            type="button"
            onClick={() => setMode('file')}
            className={`flex flex-1 items-center justify-center gap-2 rounded-md py-2 text-xs font-extrabold transition ${
              mode === 'file'
                ? 'bg-white text-ink shadow-sm'
                : 'text-slate-600 hover:text-ink'
            }`}
          >
            <FileSpreadsheet size={16} />
            Upload CSV file
          </button>
          <button
            type="button"
            onClick={() => setMode('paste')}
            className={`flex flex-1 items-center justify-center gap-2 rounded-md py-2 text-xs font-extrabold transition ${
              mode === 'paste'
                ? 'bg-white text-ink shadow-sm'
                : 'text-slate-600 hover:text-ink'
            }`}
          >
            <FileText size={16} />
            Paste text / spreadsheet
          </button>
        </div>

        {/* Mode 1: File Upload */}
        {mode === 'file' && (
          <div>
            {!file ? (
              <label
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault()
                  const dropped = e.dataTransfer.files?.[0]
                  if (dropped) {
                    const reader = new FileReader()
                    reader.onload = (event) => {
                      setFile({
                        name: dropped.name,
                        size: dropped.size,
                        content: event.target.result,
                      })
                      setRemovedIndexes(new Set())
                    }
                    reader.readAsText(dropped)
                  }
                }}
                className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/50 p-8 text-center transition hover:border-primary hover:bg-primary-tint/10 cursor-pointer"
              >
                <div className="grid h-12 w-12 place-items-center rounded-full bg-primary-tint text-primary mb-3">
                  <Upload size={22} />
                </div>
                <p className="text-sm font-bold text-slate-800">
                  Click to choose a CSV file or drag and drop here
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Supports comma-delimited (.csv) and tab-delimited (.tsv, .txt) files
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.tsv,.txt"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </label>
            ) : (
              <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-3.5 shadow-sm">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-emerald-100 text-emerald-700">
                    <FileSpreadsheet size={20} />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-extrabold text-slate-800">
                      {file.name}
                    </p>
                    <p className="text-xs text-slate-500">
                      {(file.size / 1024).toFixed(1)} KB ·{' '}
                      <span className="font-bold text-emerald-700">
                        {visibleItems.length}{' '}
                        {isFaq ? 'FAQs detected' : 'SOPs detected'}
                      </span>
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleClear}
                  className="rounded-md border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-100 hover:text-red-600 transition"
                  title="Remove file"
                >
                  <X size={16} />
                </button>
              </div>
            )}
          </div>
        )}

        {/* Mode 2: Paste Area */}
        {mode === 'paste' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700">
                Paste CSV or tabular data
              </label>
              <button
                type="button"
                onClick={handleInsertSample}
                className="text-xs font-bold text-primary hover:underline"
              >
                Insert example data
              </button>
            </div>
            <textarea
              rows={6}
              value={pastedText}
              onChange={(e) => {
                setPastedText(e.target.value)
                setRemovedIndexes(new Set())
              }}
              placeholder={
                isFaq
                  ? 'Question,Answer,Category\n"What is your return policy?","We accept returns within 30 days.","Returns"'
                  : 'Title,Situation,Check First,What To Do,What To Say,Escalate To,Category\n"Damaged Item","Item damaged in transit","Ask for photos","Dispatch replacement immediately","We have dispatched a new item for you.","Warehouse","Support"'
              }
              className="w-full rounded-lg border border-slate-300 p-3 font-mono text-xs outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
            {pastedText && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleClear}
                  className="text-xs font-bold text-slate-500 hover:text-red-600"
                >
                  Clear text
                </button>
              </div>
            )}
          </div>
        )}

        {/* Settings: Default Category & Status */}
        <div className="grid gap-3 sm:grid-cols-2 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
          <label className="grid gap-1 text-xs font-bold text-slate-700">
            Default Category
            <span className="text-[11px] font-normal text-slate-500">
              Applied if a row does not specify one
            </span>
            <select
              value={defaultCategory}
              onChange={(e) => setDefaultCategory(e.target.value)}
              className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium outline-none focus:border-primary"
            >
              <option value="Customer support">Customer support</option>
              <option value="Support">Support</option>
              <option value="Orders">Orders</option>
              <option value="Returns">Returns</option>
              <option value="Shipping">Shipping</option>
              <option value="Billing">Billing</option>
              <option value="Product">Product</option>
              <option value="General">General</option>
            </select>
          </label>
          <label className="grid gap-1 text-xs font-bold text-slate-700">
            Initial Status
            <span className="text-[11px] font-normal text-slate-500">
              Draft (requires approval before Qdrant) or Approved (stored in Qdrant)
            </span>
            <select
              value={defaultStatus}
              onChange={(e) => setDefaultStatus(e.target.value)}
              className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium outline-none focus:border-primary"
            >
              <option value="Draft">Draft (review before publishing to Qdrant)</option>
              <option value="Approved">Approved (indexes directly into Qdrant)</option>
            </select>
          </label>
        </div>

        {/* Skipped rows warning if any */}
        {skippedCount > 0 && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs font-medium text-amber-800">
            <AlertCircle size={15} className="shrink-0 text-amber-600" />
            <span>
              {skippedCount} row{skippedCount === 1 ? ' was' : 's were'} skipped because
              they were missing required fields (
              {isFaq ? 'Question or Answer' : 'Title'}).
            </span>
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs font-bold text-red-700">
            <AlertCircle size={15} className="shrink-0 text-red-600" />
            <span>{error}</span>
          </div>
        )}

        {/* Preview Section */}
        {visibleItems.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold uppercase tracking-wider text-slate-600">
                Preview ({visibleItems.length}{' '}
                {visibleItems.length === 1 ? (isFaq ? 'FAQ' : 'SOP') : (isFaq ? 'FAQs' : 'SOPs')})
              </span>
              <span className="text-[11px] font-medium text-slate-500">
                Scroll to inspect before importing
              </span>
            </div>
            <div className="max-h-60 overflow-auto rounded-lg border border-slate-200 bg-white shadow-inner">
              <table className="w-full border-collapse text-left text-xs">
                <thead className="sticky top-0 border-b border-slate-200 bg-slate-50 font-extrabold text-slate-700">
                  <tr>
                    <th className="px-3 py-2 w-8">#</th>
                    {isFaq ? (
                      <>
                        <th className="px-3 py-2">Question</th>
                        <th className="px-3 py-2">Answer</th>
                        <th className="px-3 py-2 w-28">Category</th>
                      </>
                    ) : (
                      <>
                        <th className="px-3 py-2">Title / Situation</th>
                        <th className="px-3 py-2">What To Do</th>
                        <th className="px-3 py-2">What To Say</th>
                        <th className="px-3 py-2 w-28">Category</th>
                      </>
                    )}
                    <th className="px-2 py-2 w-10 text-center"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visibleItems.map((item, index) => (
                    <tr key={index} className="hover:bg-slate-50/70 transition">
                      <td className="px-3 py-2 text-slate-400 font-mono text-[10px]">
                        {index + 1}
                      </td>
                      {isFaq ? (
                        <>
                          <td className="px-3 py-2 font-bold text-slate-800 max-w-[200px] truncate">
                            {item.question}
                          </td>
                          <td className="px-3 py-2 text-slate-600 max-w-[280px] truncate">
                            {item.answer}
                          </td>
                          <td className="px-3 py-2 text-slate-500 whitespace-nowrap">
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold">
                              {item.category || defaultCategory}
                            </span>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-3 py-2 max-w-[180px]">
                            <p className="font-bold text-slate-800 truncate">
                              {item.title}
                            </p>
                            {item.situation && item.situation !== item.title && (
                              <p className="text-[10px] text-slate-500 truncate">
                                {item.situation}
                              </p>
                            )}
                          </td>
                          <td className="px-3 py-2 text-slate-600 max-w-[200px] truncate">
                            {item.whatToDo}
                          </td>
                          <td className="px-3 py-2 text-slate-600 max-w-[200px] truncate">
                            {item.whatToSay || '—'}
                          </td>
                          <td className="px-3 py-2 text-slate-500 whitespace-nowrap">
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold">
                              {item.category || defaultCategory}
                            </span>
                          </td>
                        </>
                      )}
                      <td className="px-2 py-2 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(index)}
                          className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 transition"
                          title="Exclude this row"
                          aria-label={`Exclude row ${index + 1}`}
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
          <div className="text-xs text-slate-500">
            {visibleItems.length > 0 ? (
              <span className="font-bold text-emerald-700">
                ✓ {visibleItems.length}{' '}
                {visibleItems.length === 1 ? (isFaq ? 'FAQ' : 'SOP') : (isFaq ? 'FAQs' : 'SOPs')}{' '}
                ready to upload
              </span>
            ) : (
              <span>Upload a CSV file or paste content to preview.</span>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={uploading}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="purple"
              disabled={uploading || visibleItems.length === 0}
              onClick={handleUpload}
            >
              {uploading ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  Importing…
                </>
              ) : (
                <>
                  <Upload size={15} />
                  Import {visibleItems.length || ''} {isFaq ? 'FAQs' : 'SOPs'}
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}


import React, { useEffect, useRef, useState } from 'react'
import { CalendarDays } from 'lucide-react'
import Button from '../ui/Button'
import { DATE_RANGES, MAX_CUSTOM_DAYS } from '../../services/aiAnalytics'

// Dates here are plain YYYY-MM-DD strings in the viewer's local calendar, never UTC-shifted.
const pad = (n) => String(n).padStart(2, '0')
const toInputDate = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
const fromInputDate = (value) => new Date(`${value}T00:00:00`)
const shortDate = (value) => {
  const date = fromInputDate(value)
  if (Number.isNaN(date.getTime())) return value
  const sameYear = date.getFullYear() === new Date().getFullYear()
  return date.toLocaleDateString([], sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' })
}

/** Why a from/to pair cannot be used, or '' when it can. Mirrors what the API enforces. */
export function customRangeProblem(from, to) {
  if (!from || !to) return 'Choose both a start date and an end date.'
  const start = fromInputDate(from)
  const end = fromInputDate(to)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 'Enter valid dates.'
  if (start > end) return 'The start date must be on or before the end date.'
  const today = fromInputDate(toInputDate(new Date()))
  if (start > today) return 'The start date cannot be in the future.'
  const days = Math.round((Math.min(end, today) - start) / 86_400_000) + 1
  if (days > MAX_CUSTOM_DAYS) return `Choose a range of at most ${MAX_CUSTOM_DAYS} days.`
  return ''
}

/**
 * Date range picker shared by the analytics and conversations pages.
 *
 * `value` is `{ id, from, to }`: a preset id (today, yesterday, 7d, 15d, 30d) or `custom` with
 * from/to dates. A custom range is only applied once it is valid, so the page never requests
 * half a range.
 */
export default function DateRangeFilter({ value, onChange, className = '' }) {
  const [open, setOpen] = useState(false)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [touched, setTouched] = useState(false)
  const root = useRef(null)
  const strip = useRef(null)
  const today = toInputDate(new Date())
  const isCustom = value.id === 'custom'
  const problem = customRangeProblem(from, to)

  const openPicker = () => {
    if (isCustom) {
      setFrom(value.from)
      setTo(value.to)
    } else {
      const weekAgo = new Date()
      weekAgo.setDate(weekAgo.getDate() - 6)
      setFrom(toInputDate(weekAgo))
      setTo(today)
    }
    setTouched(false)
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return undefined
    const onPointer = (event) => { if (root.current && !root.current.contains(event.target)) setOpen(false) }
    const onKey = (event) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const apply = (event) => {
    event.preventDefault()
    setTouched(true)
    if (problem) return
    onChange({ id: 'custom', from, to })
    setOpen(false)
  }

  // On phones the options sit in one swipeable row; keep the chosen one in view.
  useEffect(() => {
    const active = strip.current?.querySelector('[aria-pressed="true"]')
    if (!active || !strip.current) return
    const box = strip.current
    box.scrollTo({ left: active.offsetLeft - (box.clientWidth - active.offsetWidth) / 2, behavior: 'smooth' })
  }, [value.id, value.from, value.to])

  const presets = DATE_RANGES.filter((range) => range.id !== 'custom')

  return (
    <div ref={root} className={`relative flex min-w-0 max-w-full items-center gap-2 ${className}`}>
      <div ref={strip} className="mac-scroll flex min-w-0 max-w-full flex-nowrap gap-0.5 overflow-x-auto rounded-control border border-line-strong bg-white p-1 shadow-card sm:flex-wrap sm:overflow-visible" role="group" aria-label="Date range">
        {presets.map((range) => (
          <button
            key={range.id}
            type="button"
            aria-pressed={value.id === range.id}
            onClick={() => { setOpen(false); onChange({ id: range.id }) }}
            className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors sm:py-1 ${value.id === range.id ? 'bg-primary text-white shadow-sm' : 'text-fg-muted hover:text-ink'}`}
          >
            {range.label}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={isCustom}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => (open ? setOpen(false) : openPicker())}
          className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs sm:py-1 font-semibold transition-colors ${isCustom ? 'bg-primary text-white shadow-sm' : 'text-fg-muted hover:text-ink'}`}
        >
          <CalendarDays size={13} />
          {isCustom ? `${shortDate(value.from)} – ${shortDate(value.to)}` : 'Custom range'}
        </button>
      </div>

      {open && (
        <form
          onSubmit={apply}
          role="dialog"
          aria-label="Custom date range"
          className="absolute right-0 top-full z-30 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-card border border-line bg-surface p-4 shadow-lg"
        >
          <p className="text-sm font-bold text-ink">Custom range</p>
          <p className="mt-0.5 text-[11px] text-fg-muted">Both days are included. Up to {MAX_CUSTOM_DAYS} days.</p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <label className="text-xs font-semibold text-fg-muted">
              From
              <input type="date" value={from} max={today} onChange={(event) => { setFrom(event.target.value); setTouched(true) }} className="mt-1 w-full rounded-control border border-line-strong bg-white px-2 py-1.5 text-xs font-medium text-ink focus:border-primary focus:outline-none" />
            </label>
            <label className="text-xs font-semibold text-fg-muted">
              To
              <input type="date" value={to} max={today} onChange={(event) => { setTo(event.target.value); setTouched(true) }} className="mt-1 w-full rounded-control border border-line-strong bg-white px-2 py-1.5 text-xs font-medium text-ink focus:border-primary focus:outline-none" />
            </label>
          </div>
          {touched && problem && <p className="mt-2 text-xs text-danger" role="alert">{problem}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" size="sm" disabled={Boolean(problem)}>Apply</Button>
          </div>
        </form>
      )}
    </div>
  )
}

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronsUpDown, Search, X } from 'lucide-react'
import Avatar from '../ui/Avatar'
import Tooltip from '../ui/Tooltip'
import { useBrand } from '../../context/BrandContext'
import { useToast } from '../../context/ToastContext'

const SEARCH_THRESHOLD = 6
const PANEL_WIDTH = 320
const PANEL_HEIGHT = 460 // generous estimate, used only to keep the panel on screen

/** Bold the part of a name that matches the search. */
function Highlight({ text, term }) {
  const query = term.trim()
  if (!query) return text
  const at = text.toLowerCase().indexOf(query.toLowerCase())
  if (at < 0) return text
  return (
    <>
      {text.slice(0, at)}
      <mark className="bg-transparent font-bold text-primary">{text.slice(at, at + query.length)}</mark>
      {text.slice(at + query.length)}
    </>
  )
}

const Key = ({ children }) => (
  <kbd className="inline-grid h-[18px] min-w-[18px] place-items-center rounded-[5px] border border-line-strong bg-white px-1 font-sans text-[10px] font-semibold leading-none text-fg-muted shadow-[0_1px_0_rgba(24,24,60,0.08)]">{children}</kbd>
)

/**
 * The prominent workspace identity at the top of the sidebar. Shows the brand being
 * managed, and lets people who have access to several brands switch between them.
 * Switching is a UI action only: every request is still authorised by the API.
 */
export default function BrandSwitcher({ collapsed = false }) {
  const { brands, brand, canSwitch, loading, selectBrand } = useBrand()
  const { showToast } = useToast()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const [fade, setFade] = useState({ top: false, bottom: false })
  const rootRef = useRef(null)
  const panelRef = useRef(null)
  const listRef = useRef(null)
  const [anchor, setAnchor] = useState(null)
  const searchRef = useRef(null)
  const searchable = brands.length > SEARCH_THRESHOLD

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase()
    return term ? brands.filter((item) => item.name.toLowerCase().includes(term)) : brands
  }, [brands, query])

  useEffect(() => {
    if (!open) return undefined
    const close = (event) => { if (!rootRef.current?.contains(event.target) && !panelRef.current?.contains(event.target)) setOpen(false) }
    const dismiss = () => setOpen(false)
    document.addEventListener('mousedown', close)
    window.addEventListener('resize', dismiss)
    return () => { document.removeEventListener('mousedown', close); window.removeEventListener('resize', dismiss) }
  }, [open])

  useEffect(() => {
    if (open) {
      setQuery('')
      setCursor(Math.max(0, brands.findIndex((item) => item.id === brand?.id)))
      window.setTimeout(() => searchRef.current?.focus(), 0)
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // Show soft edges only on the sides that actually have more to scroll to.
  const measureFade = useCallback(() => {
    const el = listRef.current
    if (!el) return
    const top = el.scrollTop > 4
    const bottom = el.scrollTop + el.clientHeight < el.scrollHeight - 4
    setFade((current) => (current.top === top && current.bottom === bottom ? current : { top, bottom }))
  }, [])
  useLayoutEffect(() => { if (open) measureFade() }, [open, filtered.length, measureFade])

  // Keyboard movement keeps the highlighted row in view.
  useEffect(() => {
    if (!open) return
    listRef.current?.querySelector(`[data-index="${cursor}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [open, cursor, filtered.length])

  // The panel is rendered in a portal and positioned from the trigger. The sidebar clips
  // anything that overflows it, so an absolutely positioned panel inside it would be cut off.
  const toggle = () => {
    if (!canSwitch) return
    if (!open && rootRef.current) {
      const rect = rootRef.current.getBoundingClientRect()
      const width = Math.min(PANEL_WIDTH, window.innerWidth - 16)
      setAnchor(
        collapsed
          ? { left: rect.right + 12, top: Math.max(8, Math.min(rect.top, window.innerHeight - PANEL_HEIGHT)), width }
          : { left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)), top: rect.bottom + 8, width },
      )
    }
    setOpen((value) => !value)
  }

  const choose = (item) => {
    setOpen(false)
    if (!item || item.id === brand?.id) return
    selectBrand(item.id)
    showToast(`Switched to ${item.name}`)
  }

  const onKeyDown = (event) => {
    if (event.key === 'Escape') {
      setOpen(false)
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      setCursor((value) => Math.min(filtered.length - 1, value + 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setCursor((value) => Math.max(0, value - 1))
    } else if (event.key === 'Home' && !query) {
      event.preventDefault()
      setCursor(0)
    } else if (event.key === 'End' && !query) {
      event.preventDefault()
      setCursor(Math.max(0, filtered.length - 1))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      choose(filtered[cursor])
    }
  }

  if (loading && !brand) {
    return (
      <div className={`flex items-center gap-3 rounded-xl ${collapsed ? 'justify-center' : 'border border-line bg-white p-2'}`} aria-busy="true">
        <span className="h-9 w-9 animate-pulse rounded-lg bg-line" />
        {!collapsed && <span className="h-8 flex-1 animate-pulse rounded-md bg-line/70" />}
      </div>
    )
  }

  const name = brand?.name || 'No workspace'
  // Same card in both sidebar states: the avatar keeps its place and the text fades as the
  // panel narrows, instead of swapping to a different layout.
  const trigger = (
    <button
      type="button"
      onClick={toggle}
      aria-haspopup={canSwitch ? 'listbox' : undefined}
      aria-expanded={canSwitch ? open : undefined}
      aria-label={`Current workspace: ${name}${canSwitch ? '. Switch workspace' : ''}`}
      className={`mac-selected group flex w-full items-center gap-3 overflow-hidden rounded-[14px] p-1.5 pr-2.5 text-left transition-shadow duration-150 ${canSwitch ? 'hover:shadow-pop' : 'cursor-default'}`}
    >
      <Avatar name={name} shape="lg" className="h-9 w-9 shrink-0 text-sm" />
      <span aria-hidden={collapsed || undefined} className={`mac-fade min-w-0 flex-1 ${collapsed ? 'opacity-0' : 'opacity-100'}`}>
        <span className="block truncate whitespace-nowrap text-sm font-semibold leading-5 text-ink">{name}</span>
        <span className="block truncate whitespace-nowrap text-xs leading-4 text-fg-muted">Brand workspace</span>
      </span>
      {canSwitch && <ChevronsUpDown size={16} className={`mac-fade shrink-0 text-fg-muted transition-colors group-hover:text-ink ${collapsed ? 'opacity-0' : 'opacity-100'}`} aria-hidden="true" />}
    </button>
  )

  const edge = 14
  const mask = fade.top || fade.bottom
    ? `linear-gradient(to bottom, ${fade.top ? 'transparent 0' : '#000 0'}, #000 ${fade.top ? edge : 0}px, #000 calc(100% - ${fade.bottom ? edge : 0}px), ${fade.bottom ? 'transparent 100%' : '#000 100%'})`
    : undefined

  return (
    <div ref={rootRef} className="relative">
      {collapsed ? <Tooltip className="flex w-full" label={`${name} · Brand workspace`} disabled={open}>{trigger}</Tooltip> : trigger}
      {open && anchor && createPortal(
        <div
          ref={panelRef}
          style={{ position: 'fixed', left: anchor.left, top: anchor.top, width: anchor.width }}
          className="z-[120] animate-pop-in glass-float overflow-hidden rounded-[20px] p-2"
          onKeyDown={onKeyDown}
        >
          <div className="flex items-center justify-between px-2 pb-2 pt-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-fg-muted">Switch workspace</p>
            <span className="rounded-full bg-primary-tint px-2 py-0.5 text-[11px] font-semibold tabular-nums text-primary">{brands.length}</span>
          </div>

          {searchable && (
            <label className="relative mb-2 block">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted" aria-hidden="true" />
              <input
                ref={searchRef}
                value={query}
                onChange={(event) => { setQuery(event.target.value); setCursor(0) }}
                placeholder="Search brands"
                aria-label="Search brands"
                className="h-10 w-full rounded-xl border border-ink/10 bg-white/80 pl-9 pr-9 text-sm text-ink shadow-[0_1px_2px_rgba(24,24,60,0.04)] outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-fg-muted/70 focus:border-primary/50 focus:bg-white focus:shadow-[0_0_0_3px_rgba(99,91,255,0.12)]"
              />
              {query && (
                <button type="button" onClick={() => { setQuery(''); setCursor(0); searchRef.current?.focus() }} aria-label="Clear search" className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full text-fg-muted transition-colors hover:bg-ink/5 hover:text-ink">
                  <X size={13} aria-hidden="true" />
                </button>
              )}
            </label>
          )}

          <ul
            ref={(node) => { listRef.current = node; if (!searchable) searchRef.current = node }}
            role="listbox"
            aria-label="Brand workspaces"
            tabIndex={searchable ? -1 : 0}
            onScroll={measureFade}
            style={mask ? { maskImage: mask, WebkitMaskImage: mask } : undefined}
            className="thin-scroll max-h-[min(20rem,calc(100svh-14rem))] overflow-y-auto overscroll-contain pr-0.5 outline-none"
          >
            {filtered.map((item, index) => {
              const active = item.id === brand?.id
              const hot = index === cursor
              return (
                <li key={item.id} role="option" aria-selected={active} data-index={index} className="mb-0.5 last:mb-0">
                  <button
                    type="button"
                    onClick={() => choose(item)}
                    onMouseEnter={() => setCursor(index)}
                    className={`group flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors duration-100 ${active ? 'bg-primary-tint/70 ring-1 ring-inset ring-primary/15' : hot ? 'bg-ink/[0.045]' : ''}`}
                  >
                    <Avatar name={item.name} shape="lg" className="h-9 w-9 text-xs" />
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate text-sm text-ink ${active ? 'font-semibold' : 'font-medium'}`}><Highlight text={item.name} term={query} /></span>
                      {item.ai_agent_name && <span className="block truncate text-xs text-fg-muted">Agent: {item.ai_agent_name}</span>}
                    </span>
                    {active ? (
                      <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary text-white"><Check size={12} strokeWidth={3} aria-label="Current workspace" /></span>
                    ) : (
                      <span className={`shrink-0 text-[11px] font-medium text-fg-muted transition-opacity duration-100 ${hot ? 'opacity-100' : 'opacity-0'}`} aria-hidden="true">Switch</span>
                    )}
                  </button>
                </li>
              )
            })}
            {!filtered.length && (
              <li className="grid justify-items-center gap-2 px-3 py-8 text-center">
                <span className="grid h-10 w-10 place-items-center rounded-full bg-subtle text-fg-muted"><Search size={16} aria-hidden="true" /></span>
                <p className="text-sm text-fg-muted">No brands match “{query}”.</p>
                <button type="button" onClick={() => { setQuery(''); searchRef.current?.focus() }} className="text-xs font-semibold text-primary hover:underline">Clear search</button>
              </li>
            )}
          </ul>

          <div className="mt-2 flex items-center justify-center gap-3 border-t border-ink/[0.06] px-2 pb-0.5 pt-2 text-[11px] text-fg-muted" aria-hidden="true">
            <span className="inline-flex items-center gap-1"><Key>↑</Key><Key>↓</Key> Navigate</span>
            <span className="inline-flex items-center gap-1"><Key>↵</Key> Select</span>
            <span className="inline-flex items-center gap-1"><Key>esc</Key> Close</span>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronsUpDown, Search } from 'lucide-react'
import Avatar from '../ui/Avatar'
import Tooltip from '../ui/Tooltip'
import { useBrand } from '../../context/BrandContext'
import { useToast } from '../../context/ToastContext'

const SEARCH_THRESHOLD = 6

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
  const rootRef = useRef(null)
  const panelRef = useRef(null)
  const [anchor, setAnchor] = useState(null)
  const searchRef = useRef(null)

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

  // The panel is rendered in a portal and positioned from the trigger. The sidebar clips
  // anything that overflows it, so an absolutely positioned panel inside it would be cut off.
  const toggle = () => {
    if (!canSwitch) return
    if (!open && rootRef.current) {
      const rect = rootRef.current.getBoundingClientRect()
      const width = Math.min(288, window.innerWidth - 16)
      setAnchor(
        collapsed
          ? { left: rect.right + 12, top: Math.max(8, Math.min(rect.top, window.innerHeight - 360)), width }
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

  return (
    <div ref={rootRef} className="relative">
      {collapsed ? <Tooltip className="flex w-full" label={`${name} · Brand workspace`} disabled={open}>{trigger}</Tooltip> : trigger}
      {open && anchor && createPortal(
        <div
          ref={panelRef}
          style={{ position: 'fixed', left: anchor.left, top: anchor.top, width: anchor.width }}
          className="z-[120] animate-pop-in glass-float rounded-card p-1.5"
          onKeyDown={onKeyDown}
        >
          <p className="px-2.5 pb-1 pt-1.5 text-xs font-medium text-fg-muted">Switch workspace</p>
          {brands.length > SEARCH_THRESHOLD && (
            <label className="relative mb-1 block">
              <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-muted" aria-hidden="true" />
              <input
                ref={searchRef}
                value={query}
                onChange={(event) => { setQuery(event.target.value); setCursor(0) }}
                placeholder="Search brands"
                aria-label="Search brands"
                className="h-9 w-full rounded-lg border border-line bg-canvas pl-8 pr-2 text-sm focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/15"
              />
            </label>
          )}
          <ul role="listbox" aria-label="Brand workspaces" className="max-h-72 overflow-y-auto" tabIndex={brands.length > SEARCH_THRESHOLD ? -1 : 0} ref={brands.length > SEARCH_THRESHOLD ? undefined : searchRef}>
            {filtered.map((item, index) => {
              const active = item.id === brand?.id
              return (
                <li key={item.id} role="option" aria-selected={active}>
                  <button
                    type="button"
                    onClick={() => choose(item)}
                    onMouseEnter={() => setCursor(index)}
                    className={`flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors duration-100 ${index === cursor ? 'bg-subtle' : ''}`}
                  >
                    <Avatar name={item.name} shape="lg" className="h-8 w-8 text-xs" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">{item.name}</span>
                      {item.ai_agent_name && <span className="block truncate text-xs text-fg-muted">Agent: {item.ai_agent_name}</span>}
                    </span>
                    {active && <Check size={16} className="shrink-0 text-primary" aria-label="Current workspace" />}
                  </button>
                </li>
              )
            })}
            {!filtered.length && <li className="px-3 py-6 text-center text-sm text-fg-muted">No brands match “{query}”.</li>}
          </ul>
        </div>,
        document.body,
      )}
    </div>
  )
}

import React from 'react'

export default function Textarea({ label, error, hint, className = '', inputRef, ...props }) {
  return (
    <label className={`grid gap-1.5 text-sm ${className}`}>
      {label && <span className="font-medium text-ink">{label}</span>}
      <textarea
        ref={inputRef}
        className={`min-h-28 w-full rounded-control border bg-white px-3 py-2.5 text-sm leading-6 text-ink transition-[border-color,box-shadow] duration-150 placeholder:text-fg-muted/70 hover:border-line-strong focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/15 disabled:cursor-not-allowed disabled:bg-subtle ${error ? 'border-danger/60' : 'border-line'}`}
        aria-invalid={Boolean(error)}
        {...props}
      />
      {hint && !error && <span className="text-xs text-fg-muted">{hint}</span>}
      {error && <span className="text-xs text-danger">{error}</span>}
    </label>
  )
}

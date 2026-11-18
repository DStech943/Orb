import React from 'react'

export default function Select({ label, error, hint, children, className = '', ...props }) {
  return (
    <label className={`grid gap-1.5 text-sm ${className}`}>
      {label && <span className="font-medium text-ink">{label}</span>}
      <select
        className={`h-10 w-full rounded-control border bg-white px-3 text-sm text-ink transition-[border-color,box-shadow] duration-150 hover:border-line-strong focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/15 disabled:cursor-not-allowed disabled:bg-subtle ${error ? 'border-danger/60' : 'border-line'}`}
        aria-invalid={Boolean(error)}
        {...props}
      >
        {children}
      </select>
      {hint && !error && <span className="text-xs text-fg-muted">{hint}</span>}
      {error && <span className="text-xs text-danger">{error}</span>}
    </label>
  )
}

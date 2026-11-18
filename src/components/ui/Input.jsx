import React from 'react'

export default function Input({ label, error, hint, className = '', inputClassName = '', ...props }) {
  const id = props.id || props.name
  return (
    <label className={`grid gap-1.5 text-sm ${className}`}>
      {label && <span className="font-medium text-ink">{label}</span>}
      <input
        id={id}
        className={`h-10 w-full rounded-control border bg-white px-3 text-sm text-ink transition-[border-color,box-shadow] duration-150 placeholder:text-fg-muted/70 hover:border-line-strong focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/15 disabled:cursor-not-allowed disabled:bg-subtle disabled:text-fg-muted ${error ? 'border-danger/60' : 'border-line'} ${inputClassName}`}
        aria-invalid={Boolean(error)}
        {...props}
      />
      {hint && !error && <span className="text-xs text-fg-muted">{hint}</span>}
      {error && <span className="text-xs text-danger">{error}</span>}
    </label>
  )
}

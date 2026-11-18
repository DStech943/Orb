import React from 'react'

export default function Toggle({ checked, onChange, label, description }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 border-b border-line py-4">
      <span>
        <span className="block text-sm font-medium">{label}</span>
        {description && <span className="mt-0.5 block text-xs text-fg-muted">{description}</span>}
      </span>
      <input type="checkbox" role="switch" className="peer sr-only" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span className="relative mt-0.5 h-6 w-11 shrink-0 rounded-full bg-line-strong transition-colors duration-180 peer-checked:bg-primary peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow-sm after:transition-transform after:duration-180 peer-checked:after:translate-x-5" />
    </label>
  )
}

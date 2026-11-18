import React, { createContext, useContext, useMemo, useState } from 'react'
import { AlertCircle, Check, X } from 'lucide-react'

const ToastContext = createContext(null)

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const dismissToast = (id) => {
    setToasts((items) => items.map((item) => (item.id === id ? { ...item, leaving: true } : item)))
    window.setTimeout(() => setToasts((items) => items.filter((item) => item.id !== id)), 180)
  }
  const showToast = (message, type = 'success') => {
    // Avoid multiple identical notices when a request is retried or a page is
    // mounted twice in React's development mode.
    setToasts((items) => {
      if (items.some((toast) => toast.message === message && toast.type === type && !toast.leaving)) return items
      const id = `${Date.now()}${Math.random()}`
      window.setTimeout(() => dismissToast(id), type === 'error' ? 5200 : 3200)
      return [...items, { id, message, type, leaving: false }]
    })
  }
  const value = useMemo(() => ({ showToast }), [])
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed bottom-5 right-5 z-[120] grid max-w-[calc(100vw-2.5rem)] gap-2.5">
        {toasts.map((toast) => (
          <div key={toast.id} role={toast.type === 'error' ? 'alert' : 'status'} className={`pointer-events-auto flex min-w-72 max-w-md items-start gap-3 glass-float rounded-card p-3 ${toast.leaving ? 'animate-page-out' : 'animate-page-in'}`}>
            <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full ${toast.type === 'error' ? 'bg-danger-tint text-danger' : 'bg-success-tint text-success'}`}>
              {toast.type === 'error' ? <AlertCircle size={13} /> : <Check size={13} />}
            </span>
            <p className="flex-1 text-sm leading-5 text-ink">{toast.message}</p>
            <button type="button" aria-label="Dismiss notification" className="text-fg-muted transition-colors hover:text-ink" onClick={() => dismissToast(toast.id)}><X size={15} /></button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast must be used within ToastProvider')
  return context
}

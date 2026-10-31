import React, { createContext, useContext, useMemo, useState } from 'react'
import { Check, X } from 'lucide-react'
const ToastContext = createContext(null)
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const dismissToast = (id) => {
    setToasts((items) => items.map((item) => item.id === id ? { ...item, leaving: true } : item))
    window.setTimeout(() => setToasts((items) => items.filter((item) => item.id !== id)), 220)
  }
  const showToast = (message, type = 'success') => {
    // Avoid multiple identical notices when a request is retried or a page is
    // mounted twice in React's development mode.
    if (toasts.some((toast) => toast.message === message && toast.type === type && !toast.leaving)) return
    const id = `${Date.now()}${Math.random()}`
    setToasts((items) => [...items, { id, message, type, leaving: false }])
    window.setTimeout(() => dismissToast(id), 3200)
  }
  const value = useMemo(() => ({ showToast }), [])
  return <ToastContext.Provider value={value}>{children}<div aria-live="polite" className="fixed bottom-5 right-5 z-[100] grid gap-3">{toasts.map((toast) => <div key={toast.id} className={`flex min-w-72 items-center gap-3 border-2 border-ink bg-white p-3 shadow-brutal ${toast.leaving ? 'animate-page-out' : 'animate-page-in'}`}><span className={toast.type === 'error' ? 'grid h-6 w-6 place-items-center bg-orange text-ink' : 'grid h-6 w-6 place-items-center bg-purple text-white'}>{toast.type === 'error' ? <X size={16} /> : <Check size={16} />}</span><p className="flex-1 text-sm font-bold">{toast.message}</p><button aria-label="Dismiss notification" onClick={() => dismissToast(toast.id)}><X size={16} /></button></div>)}</div></ToastContext.Provider>
}
export function useToast() { const context = useContext(ToastContext); if (!context) throw new Error('useToast must be used within ToastProvider'); return context }

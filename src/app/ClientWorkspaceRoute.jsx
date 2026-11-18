import React from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

// Client members share the same application shell as the operations team, but
// only receive the pages intended for their brand-facing workspace.
export const CLIENT_WORKSPACE_PATHS = new Set([
  '/app',
  '/app/client-chat',
  '/app/chat',
  '/app/flows',
  '/app/templates',
  '/app/products',
])

export const isClientWorkspacePath = (pathname) => CLIENT_WORKSPACE_PATHS.has(pathname)

export default function ClientWorkspaceRoute() {
  const { user } = useAuth()
  const location = useLocation()

  if (user?.role === 'client' && !isClientWorkspacePath(location.pathname)) {
    // Keep direct links and stale bookmarks graceful without disclosing or
    // advertising the operations-only sections.
    return <Navigate to="/app" replace />
  }

  return <Outlet />
}

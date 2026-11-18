import React from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

/**
 * Client Portal Allowed Routes
 *
 * Enforces strict separation between Datastraw's internal AI operations
 * (prompts, RAG, vector DBs, flows, templates) and the client-facing
 * AI Performance & Business Intelligence platform.
 */
export const CLIENT_WORKSPACE_PATHS = new Set([
  '/app',
  '/app/performance',
  '/app/performance/messages',
  '/app/performance/satisfaction',
  '/app/conversations',
  '/app/feedback',
  '/app/insights',
  '/app/sales',
  '/app/product-insights',
  '/app/chat',
  '/app/reports',
  '/app/tools',
  '/app/integrations',
  '/app/products',
  '/app/client-chat',
])

export const isClientWorkspacePath = (pathname) => {
  if (CLIENT_WORKSPACE_PATHS.has(pathname)) return true
  // Allow report sub-routes for brand members: /app/reports/:brandId/:feedbackId
  if (pathname.startsWith('/app/reports/')) return true
  return false
}

export default function ClientWorkspaceRoute() {
  const { user } = useAuth()
  const location = useLocation()

  if (user?.role === 'client' && !isClientWorkspacePath(location.pathname)) {
    // Keep direct links and bookmarks graceful without disclosing internal operations
    return <Navigate to="/app" replace />
  }

  return <Outlet />
}

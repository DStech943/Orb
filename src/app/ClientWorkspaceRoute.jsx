import React from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useBrand } from '../context/BrandContext'

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

/**
 * Laani Client Allowed Routes
 *
 * Restricts the client portal for Laani brand to ONLY approved sections:
 * Overview (/app), Chat with Tanya (/app/chat), Chatspace (/app/client-chat).
 * Insights, Integrations, and other routes are inaccessible.
 */
export const LAANI_CLIENT_WORKSPACE_PATHS = new Set([
  '/app',
  '/app/chat',
  '/app/client-chat',
])

export const isClientWorkspacePath = (pathname) => {
  if (CLIENT_WORKSPACE_PATHS.has(pathname)) return true
  // Allow report sub-routes for brand members: /app/reports/:brandId/:feedbackId
  if (pathname.startsWith('/app/reports/')) return true
  return false
}

export const isLaaniClientWorkspacePath = (pathname) => {
  return LAANI_CLIENT_WORKSPACE_PATHS.has(pathname)
}

export default function ClientWorkspaceRoute() {
  const { user } = useAuth()
  const { isLaani } = useBrand()
  const location = useLocation()

  if (user?.role === 'client') {
    if (isLaani) {
      if (!isLaaniClientWorkspacePath(location.pathname)) {
        // Prevent direct URL access to Insights, Integrations, etc. for Laani clients
        return <Navigate to="/app" replace />
      }
    } else if (!isClientWorkspacePath(location.pathname)) {
      // Keep direct links and bookmarks graceful without disclosing internal operations
      return <Navigate to="/app" replace />
    }
  }

  return <Outlet />
}

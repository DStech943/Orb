import React, { Suspense, lazy, useEffect } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import ProtectedRoute from './ProtectedRoute'
import ClientWorkspaceRoute from './ClientWorkspaceRoute'
import AppLayout from '../layouts/AppLayout'
import OrbLoader from '../components/ui/OrbLoader'

const Landing = lazy(() => import('../pages/Landing'))
const Auth = lazy(() => import('../pages/Auth'))
const Overview = lazy(() => import('../pages/Overview'))
const Workspace = lazy(() => import('../pages/Workspace'))
const ClientChat = lazy(() => import('../pages/ClientChat'))
const Operations = lazy(() => import('../pages/Operations'))
const AIsBrain = lazy(() => import('../pages/AIsBrain'))
const AgentChat = lazy(() => import('../pages/AgentChat'))
const AgentReport = lazy(() => import('../pages/AgentReport'))
const Feedback = lazy(() => import('../pages/Feedback'))
const Products = lazy(() => import('../pages/Products'))
const Flows = lazy(() => import('../pages/FlowsSupabase'))
const Templates = lazy(() => import('../pages/Templates'))
const Tools = lazy(() => import('../pages/Tools'))
const Settings = lazy(() => import('../pages/Settings'))
const NotFound = lazy(() => import('../pages/NotFound'))
const AiPerformance = lazy(() => import('../pages/AiPerformance'))
const Conversations = lazy(() => import('../pages/Conversations'))
const BusinessIntelligence = lazy(() => import('../pages/BusinessIntelligence'))

const Loading = () => (
  <div className="public-shell">
    <OrbLoader label="Loading Orb" />
  </div>
)

// Once the app is idle, fetch the other dashboard pages in the background so the first visit
// to each tab is instant. They are the same modules the lazy imports above resolve to.
const preloadPages = () => Promise.allSettled([
  import('../pages/Overview'), import('../pages/Workspace'), import('../pages/ClientChat'),
  import('../pages/Operations'), import('../pages/AIsBrain'), import('../pages/AgentChat'),
  import('../pages/Feedback'), import('../pages/Products'), import('../pages/FlowsSupabase'),
  import('../pages/Templates'), import('../pages/Tools'), import('../pages/Settings'),
  import('../pages/AiPerformance'), import('../pages/Conversations'), import('../pages/BusinessIntelligence'),
])

export default function AppRoutes() {
  const { pathname } = useLocation()
  useEffect(() => {
    if (!pathname.startsWith('/app')) return undefined
    const run = () => { preloadPages() }
    if ('requestIdleCallback' in window) { const id = window.requestIdleCallback(run, { timeout: 4000 }); return () => window.cancelIdleCallback(id) }
    const id = window.setTimeout(run, 1500)
    return () => window.clearTimeout(id)
  }, [pathname.startsWith('/app')]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Auth />} />
        <Route path="/signup" element={<Auth />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            <Route element={<ClientWorkspaceRoute />}>
              <Route path="/app" element={<Overview />} />
              {/* Feedback pages are open to brand members as well as staff. */}
              <Route path="/app/feedback" element={<Feedback />} />
              <Route path="/app/reports/:brandId/:feedbackId" element={<AgentReport />} />
              <Route path="/app/performance" element={<AiPerformance defaultTab="overview" />} />
              <Route path="/app/performance/messages" element={<AiPerformance defaultTab="messages" />} />
              <Route path="/app/performance/satisfaction" element={<AiPerformance defaultTab="satisfaction" />} />
              <Route path="/app/conversations" element={<Conversations />} />
              <Route path="/app/insights" element={<BusinessIntelligence defaultTab="insights" />} />
              <Route path="/app/sales" element={<BusinessIntelligence defaultTab="sales" />} />
              <Route path="/app/product-insights" element={<BusinessIntelligence defaultTab="products" />} />
              {/* The old "Reports & Issues" list was the same data as Feedback & issues. */}
              <Route path="/app/reports" element={<Navigate to="/app/feedback" replace />} />
              <Route path="/app/integrations" element={<Navigate to="/app/tools" replace />} />
              <Route path="/app/workspace" element={<Workspace />} />
              <Route path="/app/client-chat" element={<ClientChat />} />
              <Route path="/app/operations" element={<Operations />} />
              <Route path="/app/chat" element={<AgentChat />} />
              <Route path="/app/brain" element={<AIsBrain />} />
              <Route path="/app/sops" element={<Navigate to="/app/brain?tab=sops" replace />} />
              <Route path="/app/faqs" element={<Navigate to="/app/brain?tab=faqs" replace />} />
              <Route path="/app/products" element={<Products />} />
              <Route path="/app/flows" element={<Flows />} />
              <Route path="/app/templates" element={<Templates />} />
              <Route path="/app/tools" element={<Tools />} />
              <Route path="/app/settings" element={<Settings />} />
              <Route path="/app/knowledge-packs" element={<Navigate to="/app" replace />} />
            </Route>
          </Route>
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  )
}

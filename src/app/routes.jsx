import React, { Suspense, lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import ProtectedRoute from './ProtectedRoute'
import ClientWorkspaceRoute from './ClientWorkspaceRoute'
import AppLayout from '../layouts/AppLayout'
import OrbLoader from '../components/ui/OrbLoader'
import { BrutalStyle } from '../components/ui/UiStyle'

const Landing = lazy(() => import('../pages/Landing'))
const Login = lazy(() => import('../pages/Login'))
const Signup = lazy(() => import('../pages/Signup'))
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

const Loading = () => (
  <div className="min-h-screen bg-[#F7F8FC]">
    <OrbLoader label="Loading Orb" />
  </div>
)

export default function AppRoutes() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/" element={<BrutalStyle><Landing /></BrutalStyle>} />
        <Route path="/login" element={<BrutalStyle><Login /></BrutalStyle>} />
        <Route path="/signup" element={<BrutalStyle><Signup /></BrutalStyle>} />
        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            {/* Feedback pages are open to brand members as well as staff. */}
            <Route path="/app/feedback" element={<Feedback />} />
            <Route path="/app/reports/:brandId/:feedbackId" element={<AgentReport />} />
            <Route element={<ClientWorkspaceRoute />}>
              <Route path="/app" element={<Overview />} />
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
        <Route path="*" element={<BrutalStyle><NotFound /></BrutalStyle>} />
      </Routes>
    </Suspense>
  )
}

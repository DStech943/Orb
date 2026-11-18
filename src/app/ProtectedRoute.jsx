import React, { useEffect } from 'react'
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import OrbLoader from '../components/ui/OrbLoader'
import { takeReturnPath } from '../lib/returnTo'

// After Google sign-in the browser comes back to /app. If the person started from a
// shared link (for example a report in Slack), continue to that page.
function ResumeLinkedPage() {
  const navigate = useNavigate()
  const location = useLocation()
  useEffect(() => {
    if (location.pathname !== '/app') return
    const target = takeReturnPath()
    if (target) navigate(target, { replace: true })
  }, [])
  return null
}

export default function ProtectedRoute() { const { user, loading } = useAuth(); const location = useLocation(); if (loading) return <div className="min-h-screen bg-[#F7F8FC]"><OrbLoader label="Opening Orb" /></div>; return user ? <><ResumeLinkedPage /><Outlet /></> : <Navigate to="/login" replace state={{ from: location }} /> }

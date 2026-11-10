import React from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import OrbLoader from '../components/ui/OrbLoader'
export default function ProtectedRoute() { const { user, loading } = useAuth(); const location = useLocation(); if (loading) return <div className="min-h-screen bg-[#E6E9EF]"><OrbLoader label="Opening Orb" /></div>; return user ? <Outlet /> : <Navigate to="/login" replace state={{ from: location }} /> }

import React from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
export default function ProtectedRoute() { const { user, loading } = useAuth(); const location = useLocation(); if (loading) return <div className="grid min-h-screen place-items-center bg-peach"><div className="border-2 border-ink bg-white px-5 py-3 font-bold shadow-brutal">Opening Orb…</div></div>; return user ? <Outlet /> : <Navigate to="/login" replace state={{ from: location }} /> }

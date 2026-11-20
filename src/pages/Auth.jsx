import React from 'react'
import AuthPage from '../components/auth/AuthPage'

// /login and /signup both render this one page, so switching between them animates in
// place (the tab pill slides, extra fields grow in) instead of remounting the screen.
export default function Auth() { return <AuthPage /> }

import React from 'react'
import AppRoutes from './app/routes'
import AppErrorBoundary from './components/app/AppErrorBoundary'

export default function App() { return <AppErrorBoundary><AppRoutes /></AppErrorBoundary> }

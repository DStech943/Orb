import React from 'react'
import { Link } from 'react-router-dom'
import Doodle from '../components/ui/Doodle'
import Button from '../components/ui/Button'
export default function NotFound() { return <main className="grid min-h-screen place-items-center bg-peach px-4 text-center"><section className="max-w-md border-2 border-ink bg-white p-8 shadow-brutal-lg"><Doodle variant="loops" className="mx-auto h-20 w-20 text-purple" /><p className="mt-5 text-xs font-extrabold uppercase tracking-widest text-purple">404</p><h1 className="mt-2 text-4xl font-extrabold">This page drifted out of Orbit.</h1><p className="mt-4 text-sm text-muted">The link may be old, or the page may not exist yet.</p><Button href="/app" className="mt-6">Back to dashboard</Button><p className="mt-4 text-xs"><Link to="/" className="font-bold underline">Return home</Link></p></section></main> }

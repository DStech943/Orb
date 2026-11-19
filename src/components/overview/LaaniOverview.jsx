import React from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  FlaskConical,
  MessageSquare,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useBrand } from '../../context/BrandContext'
import Button from '../ui/Button'

/**
 * Simplified, abstracted business landing page for the Laani brand.
 *
 * Excludes all conversation analytics, volumes, and charts as requested,
 * presenting a clean, minimal workspace focused on the approved client capabilities:
 * Chat with Tanya and Chatspace.
 */
export default function LaaniOverview({ overview = {} }) {
  const { user } = useAuth()
  const { brand, brandName, agentName } = useBrand()

  const effectiveBrandName = brandName || overview?.brand?.name || 'Laani'
  const effectiveAgentName = agentName || brand?.ai_agent_name || 'Tanya'
  const firstName = overview?.user?.firstName || user?.name?.split(' ')[0] || 'there'

  return (
    <div className="space-y-6">
      {/* Hero Welcome Banner */}
      <section className="relative overflow-hidden rounded-2xl border border-white/80 bg-gradient-to-br from-[#FFEBDA] via-[#FFDDC2] to-[#FFD0AE] p-6 text-ink shadow-[0_12px_30px_-16px_rgba(200,110,40,0.4)]">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-12 -top-24 h-64 w-64 rounded-full bg-white/45"
        />
        <div className="relative max-w-3xl">
          <div className="flex items-center gap-3.5">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white text-lg font-bold text-primary shadow-sm">
              {(effectiveAgentName || 'T').slice(0, 1).toUpperCase()}
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-display text-2xl font-medium tracking-tight text-ink">
                  {effectiveAgentName}
                </h2>
                <span className="inline-flex items-center gap-1 rounded-full bg-white/80 px-2.5 py-0.5 text-[11px] font-semibold text-success shadow-xs">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" />
                  Online
                </span>
              </div>
              <p className="text-xs text-ink/75">
                AI assistant for{' '}
                <strong className="font-semibold text-ink">{effectiveBrandName}</strong> · Welcome
                back, <em className="font-display not-italic italic font-medium">{firstName}</em>
              </p>
            </div>
          </div>
          <p className="mt-4 text-sm leading-relaxed text-ink/85">
            Test your assistant in the interactive playground or collaborate directly with the team
            in Chatspace.
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Link to="/app/chat">
              <Button variant="primary" size="md">
                <FlaskConical size={15} /> Chat with {effectiveAgentName}
              </Button>
            </Link>
            <Link to="/app/client-chat">
              <Button variant="secondary" size="md">
                <MessageSquare size={15} /> Open Chatspace
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Core Workspace Modules */}
      <section className="space-y-3">
        <div>
          <h3 className="font-display text-lg font-medium text-ink">
            Workspace <em>Modules</em>
          </h3>
          <p className="text-xs text-fg-muted">Approved tools and collaboration spaces</p>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {/* Module 1: Chat with Tanya */}
          <div className="flex flex-col justify-between rounded-card border border-line bg-surface p-6 shadow-card transition-shadow hover:shadow-card-hover">
            <div>
              <div className="flex items-center justify-between">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary-tint text-primary">
                  <FlaskConical size={20} />
                </span>
                <span className="rounded-full bg-primary-tint px-2.5 py-0.5 text-xs font-semibold text-primary">
                  Interactive Test
                </span>
              </div>
              <h4 className="mt-4 text-base font-bold text-ink">Chat with {effectiveAgentName}</h4>
              <p className="mt-1 text-xs leading-5 text-fg-muted">
                Run private test conversations, simulate customer questions, and verify how{' '}
                {effectiveAgentName} answers before customer interactions.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-line/60">
              <Link to="/app/chat">
                <Button variant="secondary" size="sm" className="w-full justify-center">
                  <span>Open Playground</span>
                  <ArrowRight size={13} />
                </Button>
              </Link>
            </div>
          </div>

          {/* Module 2: Chatspace */}
          <div className="flex flex-col justify-between rounded-card border border-line bg-surface p-6 shadow-card transition-shadow hover:shadow-card-hover">
            <div>
              <div className="flex items-center justify-between">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-success">
                  <MessageSquare size={20} />
                </span>
                <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-success">
                  Team Hub
                </span>
              </div>
              <h4 className="mt-4 text-base font-bold text-ink">Chatspace</h4>
              <p className="mt-1 text-xs leading-5 text-fg-muted">
                Direct communication channel with your dedicated Datastraw operations team for live
                updates, operational requests, and support.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-line/60">
              <Link to="/app/client-chat">
                <Button variant="secondary" size="sm" className="w-full justify-center">
                  <span>Open Chatspace</span>
                  <ArrowRight size={13} />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

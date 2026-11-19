import React from "react";
import {
  ArrowRight,
  Bot,
  Brain,
  CheckCircle2,
  ExternalLink,
  MessageCircle,
  Sparkles,
  Zap,
} from "lucide-react";
import Button from "../ui/Button";
import useInView from "../../hooks/useInView";

export default function Hero() {
  const [ref, visible] = useInView();

  return (
    <section
      id="home"
      aria-labelledby="hero-title"
      className="relative overflow-hidden bg-canvas px-5 pb-20 pt-16 sm:pb-24 sm:pt-24"
    >
      {/* Background ambient lighting */}
      <div className="pointer-events-none absolute -left-20 top-0 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
      <div className="pointer-events-none absolute -right-20 top-20 h-96 w-96 rounded-full bg-orange/10 blur-3xl" />

      <div
        ref={ref}
        className={`reveal relative mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[1.1fr_0.9fr] ${
          visible ? "is-visible" : ""
        }`}
      >
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary-tint/70 px-3.5 py-1 text-xs font-semibold text-primary backdrop-blur-xs">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            Knowledge, made useful
          </div>

          <h1
            id="hero-title"
            className="mt-4 font-display text-4xl font-normal leading-tight tracking-tight text-ink sm:text-6xl sm:leading-[1.1]"
          >
            We help teams turn their know-how into{" "}
            <em className="italic text-primary">AI superpowers</em>.
          </h1>

          <p className="mt-5 max-w-lg text-base leading-relaxed text-fg-muted sm:text-lg">
            Orb transforms your company SOPs, FAQs, and product details into
            compact, dependable context your AI agent can actually use across
            every customer touchpoint.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button href="/signup" size="lg">
              Join Us Now <ArrowRight size={16} />
            </Button>
            <Button href="#features" variant="secondary" size="lg">
              See what’s inside
            </Button>
          </div>

          <div className="mt-10 flex flex-wrap items-center gap-6 border-t border-line pt-6 text-xs text-fg-muted">
            <span className="flex items-center gap-1.5 font-medium text-ink">
              <CheckCircle2 size={15} className="text-success" />
              Verified Brand Isolation
            </span>
            <span className="flex items-center gap-1.5 font-medium text-ink">
              <CheckCircle2 size={15} className="text-success" />
              Real-time SOP & FAQ Sync
            </span>
            <span className="flex items-center gap-1.5 font-medium text-ink">
              <CheckCircle2 size={15} className="text-success" />
              Sub-second Responses
            </span>
          </div>
        </div>

        {/* Dashboard Preview Widget */}
        <div className="relative mx-auto w-full max-w-lg">
          {/* Subtle backdrop halo */}
          <div className="absolute -inset-1 rounded-3xl bg-gradient-to-r from-primary/20 via-orange/15 to-primary/20 opacity-70 blur-xl" />

          <div className="relative rounded-2xl border border-line bg-white/95 p-5 shadow-pop backdrop-blur-sm sm:p-6">
            {/* Widget Header */}
            <div className="flex items-center justify-between border-b border-line pb-4">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary-tint text-primary shadow-xs">
                  <Bot size={20} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-ink">Tanya</h3>
                    <span className="inline-flex items-center gap-1 rounded-full bg-success-tint px-2 py-0.5 text-[10px] font-semibold text-success">
                      <span className="h-1 w-1 rounded-full bg-success" />
                      Live
                    </span>
                  </div>
                  <p className="text-xs text-fg-muted">Deployed support agent</p>
                </div>
              </div>
              <span className="rounded-lg border border-line bg-canvas px-2.5 py-1 text-[11px] font-medium text-fg-muted">
                WhatsApp
              </span>
            </div>

            {/* Conversation Preview */}
            <div className="mt-4 space-y-3">
              <div className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3.5 py-2.5 text-xs text-white shadow-xs">
                  Do you have deodorant sticks in stock?
                </div>
              </div>

              <div className="flex justify-start">
                <div className="max-w-[90%] rounded-2xl rounded-bl-sm border border-line bg-canvas px-3.5 py-2.5 text-xs leading-relaxed text-ink shadow-xs">
                  <p>
                    Yes! Our Clear Deodorant Stick is in stock in 3 fragrances
                    (Hotel Sheets, Morning Person, and Cheat Day) with 24-hr
                    odor protection.
                  </p>
                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-line/60 pt-2">
                    <span className="inline-flex items-center gap-1 rounded bg-sky-100 px-1.5 py-0.5 text-[9px] font-semibold text-sky-700">
                      FAQ Verified
                    </span>
                    <span className="text-[10px] font-medium text-fg-muted">
                      Knowledge score 0.98
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Diagnostic Footer Bar */}
            <div className="mt-5 rounded-xl border border-line bg-white p-3 text-[11px] shadow-2xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-fg-muted">
                  <Zap size={13} className="text-primary" />
                  <span>Latency: <strong className="text-ink font-semibold">240 ms</strong></span>
                </div>
                <div className="flex items-center gap-2 text-fg-muted">
                  <Brain size={13} className="text-purple" />
                  <span>Route: <strong className="text-success font-semibold">Auto-send</strong></span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

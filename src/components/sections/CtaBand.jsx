import React from "react";
import { ArrowRight, Sparkles } from "lucide-react";
import Button from "../ui/Button";
import useInView from "../../hooks/useInView";

export default function CtaBand() {
  const [ref, visible] = useInView();

  return (
    <section id="cta" aria-labelledby="cta-title" className="bg-canvas px-5 pb-24">
      <div
        ref={ref}
        className={`reveal relative mx-auto grid max-w-5xl items-center gap-8 overflow-hidden rounded-3xl border border-line bg-gradient-to-br from-[#1C1844] via-[#2A2362] to-[#1C1844] p-10 sm:p-14 text-white shadow-pop md:grid-cols-[1.2fr_auto] ${
          visible ? "is-visible" : ""
        }`}
      >
        {/* Soft background ambient blurs */}
        <div className="pointer-events-none absolute -left-20 -top-20 h-64 w-64 rounded-full bg-primary/40 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -right-20 h-64 w-64 rounded-full bg-orange/25 blur-3xl" />

        <div className="relative z-10">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold text-primary-tint backdrop-blur-xs">
            <Sparkles size={12} className="text-primary-tint" />
            Launch in minutes
          </span>
          <h2
            id="cta-title"
            className="mt-3 font-display text-3xl font-normal leading-tight text-white sm:text-4xl"
          >
            Get started with a clearer <em className="italic text-primary-tint">AI brain</em>.
          </h2>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-white/75">
            Give your AI agent the confident, reliable context it deserves.
            Tested across real customer channels with complete brand isolation.
          </p>
        </div>

        <div className="relative z-10 shrink-0">
          <Button href="/signup" variant="light" size="lg">
            Join Us Now <ArrowRight size={16} />
          </Button>
        </div>
      </div>
    </section>
  );
}

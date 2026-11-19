import React from "react";
import { Box, FileText, Layers3, ShieldCheck, Sparkles, ArrowRight } from "lucide-react";
import { features } from "../../data/features";
import SectionHeading from "../ui/SectionHeading";
import Button from "../ui/Button";
import useInView from "../../hooks/useInView";

const icons = { Box, FileText, Layers3, ShieldCheck };

export default function Features() {
  const [ref, visible] = useInView();

  return (
    <section id="features" aria-labelledby="feature-title" className="bg-canvas px-5 py-24">
      <div
        ref={ref}
        className={`reveal mx-auto max-w-6xl ${visible ? "is-visible" : ""}`}
      >
        <SectionHeading
          id="feature-title"
          badge="Platform Architecture"
          title="Keep all your AI knowledge in one place"
          description="Consolidate policies, catalogs, and operational SOPs into verified context so your AI never hallucinates or goes off-script."
        />

        <div className="mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {/* Featured Spotlight Card */}
          <div className="relative flex flex-col justify-between overflow-hidden rounded-3xl border border-line bg-gradient-to-br from-[#1C1844] via-[#2A2362] to-[#1C1844] p-8 text-white shadow-pop md:col-span-2">
            <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-primary/30 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-20 -left-10 h-64 w-64 rounded-full bg-orange/20 blur-3xl" />

            <div className="relative z-10">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold text-primary-tint backdrop-blur-xs">
                <Sparkles size={12} className="text-primary-tint" />
                Unified AI Brain
              </span>
              <h3 className="mt-4 font-display text-2xl font-normal leading-tight text-white sm:text-3xl">
                Real-time retrieval with guaranteed brand isolation.
              </h3>
              <p className="mt-3 max-w-lg text-sm leading-relaxed text-white/75">
                Each workspace has isolated vectors, scoped permissions, and
                instant SOP sync so changes made by your team reflect live in
                seconds.
              </p>
            </div>

            <div className="relative z-10 mt-8">
              <Button href="/signup" variant="light" size="sm">
                Get Started Free <ArrowRight size={14} />
              </Button>
            </div>
          </div>

          {/* 4 Feature Cards */}
          {features.map((feature) => {
            const Icon = icons[feature.icon] || Layers3;
            return (
              <div
                key={feature.title}
                className="flex flex-col justify-between rounded-2xl border border-line bg-white p-7 shadow-card transition-all duration-200 hover:-translate-y-1 hover:shadow-pop"
              >
                <div>
                  <div className="grid h-12 w-12 place-items-center rounded-2xl bg-primary-tint text-primary shadow-2xs">
                    <Icon size={22} strokeWidth={2} />
                  </div>
                  <h4 className="mt-5 text-base font-bold text-ink">
                    {feature.title}
                  </h4>
                  <p className="mt-2 text-sm leading-relaxed text-fg-muted">
                    {feature.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

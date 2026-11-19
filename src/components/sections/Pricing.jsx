import React from "react";
import { Check, Sparkles } from "lucide-react";
import { plans } from "../../data/pricing";
import Button from "../ui/Button";
import SectionHeading from "../ui/SectionHeading";
import useInView from "../../hooks/useInView";

export default function Pricing() {
  const [ref, visible] = useInView();

  return (
    <section id="pricing" aria-labelledby="pricing-title" className="bg-canvas px-5 py-24 border-t border-line">
      <div
        ref={ref}
        className={`reveal mx-auto max-w-6xl ${visible ? "is-visible" : ""}`}
      >
        <SectionHeading
          id="pricing-title"
          badge="Simple Pricing"
          title="Made for everyone & best for all"
          description="Scale effortlessly from your first pilot AI agent to enterprise-grade omnichannel deployment."
        />

        <div className="mt-14 grid gap-6 lg:grid-cols-3">
          {plans.map((plan) => (
            <article
              key={plan.name}
              className={`relative flex flex-col justify-between rounded-3xl p-8 transition-all duration-200 hover:-translate-y-1 ${
                plan.popular
                  ? "border-2 border-primary bg-white shadow-pop ring-4 ring-primary/10"
                  : "border border-line bg-white shadow-card hover:shadow-pop"
              }`}
            >
              {plan.popular && (
                <span className="absolute -top-3.5 right-6 inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-white shadow-sm">
                  <Sparkles size={12} /> Most Popular
                </span>
              )}

              <div>
                <p className="text-base font-bold text-ink">{plan.name}</p>
                <div className="mt-4 flex items-baseline">
                  <span className="text-4xl font-extrabold tracking-tight text-ink sm:text-5xl">
                    ${plan.price}
                  </span>
                  <span className="ml-1.5 text-xs font-semibold uppercase tracking-wider text-fg-muted">
                    / Month
                  </span>
                </div>
                <p className="mt-4 min-h-10 text-xs leading-5 text-fg-muted">
                  {plan.description}
                </p>

                <ul className="mt-6 space-y-3 border-t border-line pt-6">
                  {plan.features.map((feature) => (
                    <li
                      key={feature}
                      className="flex items-center gap-2.5 text-xs font-medium text-ink"
                    >
                      <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-emerald-50 text-emerald-600">
                        <Check size={12} strokeWidth={2.5} />
                      </span>
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-8 pt-2">
                <Button
                  href="/signup"
                  variant={plan.popular ? "primary" : "secondary"}
                  size="md"
                  className="w-full justify-center"
                >
                  {plan.cta}
                </Button>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

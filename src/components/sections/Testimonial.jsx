import React from "react";
import { Quote } from "lucide-react";
import { testimonial } from "../../data/testimonials";
import useInView from "../../hooks/useInView";

export default function Testimonial() {
  const [ref, visible] = useInView();

  return (
    <section aria-label="Customer testimonial" className="bg-canvas px-5 pb-24">
      <div
        ref={ref}
        className={`reveal relative mx-auto max-w-4xl overflow-hidden rounded-3xl border border-line bg-gradient-to-br from-white via-white to-primary-tint/25 px-8 py-14 text-center shadow-card sm:px-20 sm:py-16 ${
          visible ? "is-visible" : ""
        }`}
      >
        {/* Subtle decorative circles */}
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-80 w-80 -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary/10" />
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-56 w-56 -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary/10" />

        <div className="relative z-10">
          <div className="mx-auto mb-6 grid h-12 w-12 place-items-center rounded-2xl bg-primary-tint text-primary shadow-xs">
            <Quote size={22} className="fill-primary" />
          </div>

          <blockquote className="mx-auto max-w-2xl font-display text-xl font-normal leading-relaxed text-ink sm:text-2xl">
            “{testimonial.quote}”
          </blockquote>

          <div className="mt-8 flex flex-col items-center justify-center">
            <p className="text-sm font-bold text-ink">{testimonial.author}</p>
            <p className="text-xs font-medium text-fg-muted">{testimonial.role}</p>
          </div>
        </div>
      </div>
    </section>
  );
}

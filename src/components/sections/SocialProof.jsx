import React from "react";
import { Star } from "lucide-react";
import useInView from "../../hooks/useInView";

const reviews = [
  { name: "Trustpilot", score: "4.9/5", quote: "Makes our brand knowledge instantly usable for AI." },
  { name: "Capterra", score: "4.8/5", quote: "Drastically reduced hallucinations on product queries." },
  { name: "G2", score: "5.0/5", quote: "Our support agents and AI finally share the same brain." },
];

export default function SocialProof() {
  const [ref, visible] = useInView();

  return (
    <section
      aria-labelledby="proof-title"
      className="border-y border-line bg-white/80 px-5 py-16 backdrop-blur-xs"
    >
      <div
        ref={ref}
        className={`reveal mx-auto max-w-5xl text-center ${
          visible ? "is-visible" : ""
        }`}
      >
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">
          Customer Confidence
        </p>
        <h2
          id="proof-title"
          className="mt-2 font-display text-2xl font-normal leading-tight tracking-tight text-ink sm:text-3xl"
        >
          Consistently rated <em>4.9/5</em> by leading retail and consumer brands
        </h2>

        <div className="mt-10 grid gap-6 sm:grid-cols-3">
          {reviews.map((review) => (
            <div
              key={review.name}
              className="rounded-2xl border border-line bg-canvas p-6 text-center shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-pop"
            >
              <div className="flex items-center justify-center gap-1 text-amber-500" aria-label="5 out of 5 stars">
                {Array.from({ length: 5 }, (_, i) => (
                  <Star key={i} size={15} fill="currentColor" />
                ))}
              </div>
              <p className="mt-3 text-sm font-semibold text-ink">
                {review.name} · <span className="text-primary font-bold">{review.score}</span>
              </p>
              <p className="mt-2 text-xs leading-relaxed text-fg-muted">
                “{review.quote}”
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

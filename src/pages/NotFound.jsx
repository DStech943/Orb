import React from "react";
import { Link } from "react-router-dom";
import { Compass } from "lucide-react";
import Button from "../components/ui/Button";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas p-4 text-center">
      <div className="relative mx-auto w-full max-w-md rounded-3xl border border-line bg-white p-8 shadow-card sm:p-10">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary-tint text-primary shadow-xs">
          <Compass size={28} />
        </div>
        <p className="mt-5 text-xs font-semibold uppercase tracking-wider text-primary">
          404 Not Found
        </p>
        <h1 className="mt-2 font-display text-2xl font-normal text-ink sm:text-3xl">
          This page drifted out of <em>Orbit</em>.
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-fg-muted">
          The link may be broken, or the page may have been moved or archived.
        </p>
        <div className="mt-7 flex flex-col gap-2.5">
          <Button href="/app" variant="primary" size="md" className="w-full">
            Back to dashboard
          </Button>
          <Link
            to="/"
            className="text-xs font-semibold text-fg-muted transition hover:text-ink"
          >
            Return to homepage
          </Link>
        </div>
      </div>
    </main>
  );
}

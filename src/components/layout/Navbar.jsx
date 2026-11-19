import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { navLinks } from "../../data/navLinks";
import Button from "../ui/Button";

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <header className="sticky top-3 z-50 px-4">
      <nav
        aria-label="Main navigation"
        className="mx-auto max-w-5xl rounded-2xl border border-line/80 bg-white/90 px-5 py-3 shadow-card backdrop-blur-md transition-all sm:px-6"
      >
        <div className="flex items-center justify-between">
          <Link
            to="/"
            className="orb-wordmark text-xl font-extrabold tracking-tight text-ink"
            onClick={close}
          >
            Orb<span className="text-primary">.</span>
          </Link>

          <div className="hidden items-center gap-7 lg:flex">
            {navLinks.map((link) => (
              <a
                className="text-xs font-semibold text-fg-muted transition-colors hover:text-ink"
                href={link.href}
                key={link.label}
              >
                {link.label}
              </a>
            ))}
          </div>

          <div className="hidden items-center gap-4 lg:flex">
            <Link
              to="/login"
              className="text-xs font-semibold text-fg-muted transition-colors hover:text-ink"
            >
              Sign In
            </Link>
            <Button href="/signup" variant="primary" size="sm">
              Get Started
            </Button>
          </div>

          <button
            className="grid h-9 w-9 place-items-center rounded-xl text-fg-muted transition hover:bg-subtle hover:text-ink lg:hidden"
            aria-label="Toggle menu"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            {open ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>

        {open && (
          <div className="mt-3 border-t border-line pt-3 lg:hidden">
            <div className="grid gap-1">
              {navLinks.map((link) => (
                <a
                  className="rounded-lg px-3 py-2 text-sm font-medium text-ink transition hover:bg-subtle hover:text-primary"
                  href={link.href}
                  onClick={close}
                  key={link.label}
                >
                  {link.label}
                </a>
              ))}
              <div className="mt-2 flex flex-col gap-2 border-t border-line pt-2">
                <Link
                  to="/login"
                  className="rounded-lg px-3 py-2 text-sm font-medium text-ink transition hover:bg-subtle"
                  onClick={close}
                >
                  Sign In
                </Link>
                <Button href="/signup" variant="primary" size="sm" className="w-full">
                  Get Started
                </Button>
              </div>
            </div>
          </div>
        )}
      </nav>
    </header>
  );
}

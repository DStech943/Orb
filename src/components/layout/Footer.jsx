import React from "react";
import { footerLinks } from "../../data/navLinks";

export default function Footer() {
  return (
    <footer className="border-t border-line bg-white px-6 py-14">
      <div className="mx-auto grid max-w-6xl gap-10 md:grid-cols-[1.5fr_2fr]">
        <div>
          <a
            href="#home"
            className="orb-wordmark text-2xl font-extrabold tracking-tight text-ink"
            aria-label="Orb home"
          >
            Orb<span className="text-primary">.</span>
          </a>
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-fg-muted">
            Clear company knowledge and verified context, ready for your AI agent.
          </p>
          <p className="mt-8 text-xs text-fg-muted/80">
            © {new Date().getFullYear()} Orb. All rights reserved.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-6">
          {footerLinks.map((group) => (
            <div key={group.title}>
              <h4 className="text-xs font-bold uppercase tracking-wider text-ink">
                {group.title}
              </h4>
              <ul className="mt-4 space-y-2.5">
                {group.links.map((link) => (
                  <li key={link}>
                    <a
                      href="#home"
                      className="text-xs font-medium text-fg-muted transition-colors hover:text-primary"
                    >
                      {link}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </footer>
  );
}

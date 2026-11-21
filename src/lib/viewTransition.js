import { startTransition } from 'react'

/**
 * Shared-element navigation between the landing page and the sign in / sign up page.
 * The orb on both pages carries `view-transition-name: orb-shared`, so the browser glides it
 * from one place to the other while the rest of the page cross-fades.
 *
 * Browsers without the View Transitions API (and people who prefer reduced motion) just
 * navigate normally.
 */
let arrivedAt = 0

/** True for a couple of seconds after a shared-element navigation, so the new page can
 *  show its orb immediately instead of replaying its entrance animation. */
export const arrivedViaTransition = () => Date.now() - arrivedAt < 2500

const PRELOAD = [
  [/^\/(login|signup)(\/|$)/, () => import('../pages/Auth')],
  [/^\/$/, () => import('../pages/Landing')],
]

const targetMarker = (to) => (/^\/(login|signup)/.test(to) ? 'auth' : to === '/' ? 'landing' : '')

/** Resolves once the destination page is in the DOM (or after a safety timeout).
 *  Timers, not requestAnimationFrame: the browser pauses rendering (and so animation frames)
 *  while it waits for this promise, so an rAF loop here would never finish. */
const waitForPage = (marker) => new Promise((resolve) => {
  const started = performance.now()
  const check = () => {
    if (document.querySelector(`[data-vt-page="${marker}"]`)) {
      // A beat for the new page's effects (the orb's first WebGL frame) to run before the snapshot.
      setTimeout(resolve, 80)
    } else if (performance.now() - started > 1500) resolve()
    else setTimeout(check, 16)
  }
  check()
})

const NAME = 'orb-shared'
const nameOrb = (on) => document.querySelectorAll('[data-vt-orb]').forEach((el) => {
  if (on) el.style.setProperty('view-transition-name', NAME)
  else el.style.removeProperty('view-transition-name')
})

export function transitionNavigate(navigate, to, options) {
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const marker = targetMarker(to)
  if (!document.startViewTransition || reduce || !marker) return navigate(to, options)
  // Load the destination first, so it never flashes a loading screen mid-transition.
  const preload = PRELOAD.find(([pattern]) => pattern.test(to))?.[1]
  Promise.resolve(preload?.()).catch(() => {}).then(() => {
    arrivedAt = Date.now()
    // The name is only on the orbs for the length of the glide: a permanent
    // view-transition-name costs paint isolation on every frame of normal scrolling.
    nameOrb(true)
    const transition = document.startViewTransition(async () => {
      // A transition keeps the old page on screen until the new one is ready.
      startTransition(() => navigate(to, options))
      await waitForPage(marker)
      nameOrb(true)
    })
    transition.finished.finally(() => nameOrb(false))
  })
}

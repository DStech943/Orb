import '@fontsource-variable/geist'
import React, { Suspense, useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { motion } from 'motion/react'
import Sidebar from '../components/app/Sidebar'
import Topbar from '../components/app/Topbar'
import OrbGuide from '../components/app/OrbGuide'
import Drawer from '../components/ui/Drawer'
import OrbLoader from '../components/ui/OrbLoader'
import { BrandProvider, useBrand } from '../context/BrandContext'

// Pages are re-created whenever the brand changes (`key={brandId}`), so every screen
// loads its data again for the newly selected workspace and nothing from the previous
// brand can linger in component state.
function Workspace({ children }) {
  const { loading, brandId } = useBrand()
  const { pathname } = useLocation()
  if (loading) return <OrbLoader compact label="Opening your workspace" />
  // Each page fades and rises in, and its cards settle with a short stagger (`mac-page`).
  // The rise ends at `transform: none`, so it never stays a containing block for the
  // full-screen flow editor or fixed overlays; the flow canvas only fades.
  const lift = pathname === '/app/flows' ? {} : { y: 10 }
  return (
    <motion.div
      key={`${brandId || 'no-brand'}:${pathname}`}
      className="mac-page"
      initial={{ opacity: 0, ...lift }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.32, 0.72, 0, 1] }}
    >
      {children}
    </motion.div>
  )
}

// The shell glides in once when the app opens: sidebar first, then the top bar.
const enter = (delay, from) => ({
  initial: { opacity: 0, ...from },
  animate: { opacity: 1, x: 0, y: 0 },
  transition: { duration: 0.6, delay, ease: [0.32, 0.72, 0, 1] },
})

/*
 * macOS-style window (after the CX Copilot "liquid glass" dashboards): Orb's warm canvas
 * with floating frosted panels inset 10px from the edge and 10px apart:
 *   [ sidebar 248px, or 68px collapsed ] [ top bar + page ]
 * The sidebar is fixed; the page still scrolls the window, so sticky headers and the
 * full-screen flow editor behave exactly as before.
 */
export default function AppLayout() {
  const [open, setOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem('orb:sidebar-collapsed') === 'true'
    } catch {
      return false
    }
  })

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev
      try {
        localStorage.setItem('orb:sidebar-collapsed', String(next))
      } catch {
        // Preference simply will not persist.
      }
      return next
    })
  }

  // Marks the document as the signed-in app, so shared rules (corner radii, type) also reach
  // dialogs and menus that render outside this component's tree.
  useEffect(() => {
    document.body.classList.add('in-app')
    return () => document.body.classList.remove('in-app')
  }, [])

  const location = useLocation()
  const isFlowCanvas = location.pathname === '/app/flows'

  return (
    <BrandProvider>
      <div className={`app-shell min-h-screen ${collapsed ? 'lg:pl-[88px]' : 'lg:pl-[268px]'} mac-ease transition-[padding]`}>
        {/* One floating sidebar. Collapsing narrows the same panel to its icons (248px → 68px)
            on the macOS curve; icons stay put and only the labels fade. */}
        <motion.div
          className="fixed inset-y-2.5 left-2.5 z-30 hidden lg:block"
          initial={{ opacity: 0, x: -16, width: collapsed ? 68 : 248 }}
          animate={{ opacity: 1, x: 0, width: collapsed ? 68 : 248 }}
          transition={{ duration: 0.38, ease: [0.32, 0.72, 0, 1], opacity: { duration: 0.6 }, x: { duration: 0.6 } }}
        >
          <div className="mac-panel h-full overflow-hidden">
            <Sidebar collapsed={collapsed} onToggleCollapse={toggleCollapsed} />
          </div>
        </motion.div>
        <Drawer open={open} onClose={() => setOpen(false)} title="Orb navigation" side="left" width="max-w-[300px]" bare>
          <Sidebar mobile onClose={() => setOpen(false)} />
        </Drawer>
        <div className="px-2.5 pb-2.5 lg:pl-0">
          <motion.div {...enter(0.12, { y: -12 })} className="sticky top-2.5 z-20 mt-2.5">
            <Topbar onMenu={() => setOpen(true)} />
          </motion.div>
          <main className="min-h-[calc(100vh-88px)] px-1.5 py-5 sm:px-4 sm:py-6">
            {/* A page that is still downloading shows a small loader here, so the sidebar and
                top bar stay in place instead of the whole app flashing a loading screen. */}
            <Suspense fallback={<OrbLoader compact label="Loading" />}>
              <Workspace>
                <Outlet />
              </Workspace>
            </Suspense>
          </main>
        </div>
        {!isFlowCanvas && <OrbGuide />}
      </div>
    </BrandProvider>
  )
}

export const registerServiceWorker = () => {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return

  let refreshedForNewWorker = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // A new worker has already precached the matching, hashed build assets.
    // Reload exactly once so people receive the deployed UI immediately.
    if (refreshedForNewWorker) return
    refreshedForNewWorker = true
    window.location.reload()
  })

  const register = () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .then((registration) => registration.update())
      .catch((error) => console.warn('[PWA] Service worker registration failed.', error))
  }

  if (document.readyState === 'complete') register()
  else window.addEventListener('load', register, { once: true })
}

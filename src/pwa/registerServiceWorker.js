export const registerServiceWorker = () => {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return

  const register = () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .catch((error) => console.warn('[PWA] Service worker registration failed.', error))
  }

  if (document.readyState === 'complete') register()
  else window.addEventListener('load', register, { once: true })
}

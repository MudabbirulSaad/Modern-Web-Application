export const registerServiceWorker = () => {
  if (import.meta.env?.PROD === false) {
    return
  }

  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return
  }

  if (!('serviceWorker' in navigator)) {
    return
  }

  const register = () => {
    void navigator.serviceWorker.register('/sw.js')
  }

  if (document.readyState === 'complete') {
    register()
    return
  }

  window.addEventListener('load', register, { once: true })
}

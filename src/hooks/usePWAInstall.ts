import { useEffect, useState } from 'react'

export function isRunningStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true ||
    document.referrer.includes('android-app://')
  )
}

export function isAppleDevice(): boolean {
  if (typeof window === 'undefined') return false
  const ua = window.navigator.userAgent.toLowerCase()
  const isAppleMobile = /iphone|ipad|ipod/.test(ua)
  // iPadOS on Safari desktop UA reports MacIntel with maxTouchPoints > 1
  const isIPadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
  return isAppleMobile || isIPadOS
}

export function usePWAInstall() {
  const [isStandalone, setIsStandalone] = useState(false)
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null)
  const [showGuideModal, setShowGuideModal] = useState(false)
  const [isIOSDevice, setIsIOSDevice] = useState(false)

  useEffect(() => {
    setIsStandalone(isRunningStandalone())
    setIsIOSDevice(isAppleDevice())

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e)
    }

    const handleAppInstalled = () => {
      setIsStandalone(true)
      setDeferredPrompt(null)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [])

  const triggerInstall = async () => {
    if (isStandalone) return

    if (deferredPrompt) {
      try {
        deferredPrompt.prompt()
        const choice = await deferredPrompt.userChoice
        if (choice?.outcome === 'accepted') {
          setIsStandalone(true)
        }
        setDeferredPrompt(null)
        return
      } catch (err) {
        console.warn('Native install prompt failed, falling back to guide:', err)
      }
    }

    // On iOS/iPadOS Safari or other browsers without native deferred prompt, show guide modal
    setShowGuideModal(true)
  }

  return {
    isStandalone,
    isIOSDevice,
    showGuideModal,
    setShowGuideModal,
    triggerInstall,
    hasNativePrompt: !!deferredPrompt,
  }
}

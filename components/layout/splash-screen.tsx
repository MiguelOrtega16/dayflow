'use client'

import { useState, useEffect } from 'react'

export function SplashScreen() {
  const [visible, setVisible] = useState(true)
  const [fading, setFading]   = useState(false)

  useEffect(() => {
    // Dismiss the Capacitor native splash now that the WebView has rendered content.
    // launchAutoHide:false keeps it covering the black WebView-loading gap;
    // we hide it here so both splashes fade out together.
    import('@capacitor/core').then(({ Capacitor }) => {
      if (!Capacitor.isNativePlatform()) return
      import('@capacitor/splash-screen').then(({ SplashScreen }) => {
        SplashScreen.hide({ fadeOutDuration: 350 })
      })
    })

    setFading(true)
    const t = setTimeout(() => setVisible(false), 380)
    return () => clearTimeout(t)
  }, [])

  if (!visible) return null

  return (
    <div id="app-splash" style={{ opacity: fading ? 0 : 1 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icon-512.png" alt="" className="app-splash-icon" />
      <span className="app-splash-title">DayFlow</span>
      <div className="app-splash-spinner" />
    </div>
  )
}

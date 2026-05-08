'use client'

import { useState, useEffect } from 'react'

export function SplashScreen() {
  const [visible, setVisible] = useState(true)
  const [fading, setFading]   = useState(false)

  useEffect(() => {
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

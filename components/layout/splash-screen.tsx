'use client'

import { useEffect } from 'react'

export function SplashScreen() {
  useEffect(() => {
    const el = document.getElementById('app-splash')
    if (!el) return
    el.style.opacity = '0'
    setTimeout(() => el.remove(), 350)
  }, [])
  return null
}

'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'

export function NavigationProgress() {
  const pathname    = usePathname()
  const prevPath    = useRef(pathname)
  const [width, setWidth]     = useState(0)
  const [visible, setVisible] = useState(false)
  const ticker      = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const isNavigating = useRef(false)

  const startTicker = (from: number) => {
    if (ticker.current) clearTimeout(ticker.current)
    let w = from
    const tick = () => {
      w = w < 60 ? w + Math.random() * 10 : w < 80 ? w + 2 : w < 90 ? w + 0.5 : w
      setWidth(Math.min(w, 90))
      if (w < 90) ticker.current = setTimeout(tick, 100)
    }
    ticker.current = setTimeout(tick, 100)
  }

  const finish = () => {
    if (ticker.current) clearTimeout(ticker.current)
    setWidth(100)
    setTimeout(() => { setVisible(false); setWidth(0) }, 300)
  }

  // Start immediately on any internal link click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest('a')
      if (!anchor) return
      const href = anchor.getAttribute('href')
      if (!href || !href.startsWith('/') || href === pathname) return
      isNavigating.current = true
      setVisible(true)
      setWidth(10)
      startTicker(10)
    }
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [pathname])

  // Complete when pathname actually changes
  useEffect(() => {
    if (pathname === prevPath.current) return
    prevPath.current = pathname

    if (!isNavigating.current) {
      // Programmatic navigation (router.push etc.) — start and immediately finish
      setVisible(true)
      setWidth(60)
    }
    isNavigating.current = false
    finish()
  }, [pathname])

  if (!visible) return null

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] h-[3px] bg-primary/20 pointer-events-none">
      <div
        className="h-full bg-primary transition-[width] duration-150 ease-out"
        style={{ width: `${width}%` }}
      />
    </div>
  )
}

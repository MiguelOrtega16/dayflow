'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'

export function NavigationProgress() {
  const pathname     = usePathname()
  const prevPath     = useRef(pathname)
  const [width, setWidth]   = useState(0)
  const [visible, setVisible] = useState(false)
  const raf = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    if (pathname === prevPath.current) return
    prevPath.current = pathname

    // Reset and start animation
    setWidth(0)
    setVisible(true)

    let w = 0
    const tick = () => {
      w = w < 70 ? w + Math.random() * 12 : w < 90 ? w + 1 : w
      setWidth(Math.min(w, 90))
      if (w < 90) raf.current = setTimeout(tick, 80)
    }
    raf.current = setTimeout(tick, 30)

    // Complete after a short delay
    const done = setTimeout(() => {
      if (raf.current) clearTimeout(raf.current)
      setWidth(100)
      setTimeout(() => setVisible(false), 300)
    }, 500)

    return () => {
      if (raf.current) clearTimeout(raf.current)
      clearTimeout(done)
    }
  }, [pathname])

  if (!visible) return null

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] h-[3px] bg-primary/20 pointer-events-none">
      <div
        className="h-full bg-primary transition-[width] duration-200 ease-out"
        style={{ width: `${width}%` }}
      />
    </div>
  )
}

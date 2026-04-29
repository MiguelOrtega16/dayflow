'use client'

import { useEffect } from 'react'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const root = document.documentElement
    const previous = root.classList.contains('dark') ? 'dark' : 'light'
    root.classList.remove('light', 'dark')
    root.classList.add('dark')
    return () => {
      root.classList.remove('light', 'dark')
      root.classList.add(previous)
    }
  }, [])

  return <>{children}</>
}

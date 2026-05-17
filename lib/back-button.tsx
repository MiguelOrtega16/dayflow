'use client'

import { App as CapacitorApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useT } from '@/lib/i18n'

/**
 * Hardware back-button handling for the Capacitor Android app.
 *
 * Behavior:
 *   1. If any registered "close" handler is on the stack (e.g. an open modal),
 *      pop the most recent one and call it — closes the modal without leaving
 *      the app.
 *   2. Otherwise, show a "Quit DayFlow?" confirmation modal. The user can
 *      cancel (stays in app) or confirm (`App.exitApp()`).
 *
 * Open modals register/deregister themselves via `useBackButtonClose(open, onClose)`.
 *
 * No-op on web (or non-Capacitor platforms).
 */

type BackHandler = () => void

const BackButtonContext = createContext<{
  register: (handler: BackHandler) => () => void
}>({
  register: () => () => {},
})

export function BackButtonProvider({ children }: { children: React.ReactNode }) {
  const t = useT()
  const handlersRef = useRef<BackHandler[]>([])
  const [confirmingQuit, setConfirmingQuit] = useState(false)
  // Mirror confirmingQuit into a ref so the once-bound back listener can
  // read the latest value without us re-binding the listener every render.
  const confirmingQuitRef = useRef(false)
  useEffect(() => { confirmingQuitRef.current = confirmingQuit }, [confirmingQuit])

  const register = useCallback((handler: BackHandler) => {
    handlersRef.current = [...handlersRef.current, handler]
    return () => {
      handlersRef.current = handlersRef.current.filter(h => h !== handler)
    }
  }, [])

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    let cancelled = false
    let sub: { remove: () => Promise<void> } | null = null

    CapacitorApp.addListener('backButton', () => {
      if (cancelled) return
      // If we're already showing the quit dialog, treat back as "cancel".
      if (confirmingQuitRef.current) {
        setConfirmingQuit(false)
        return
      }
      // Pop the most-recently-registered close handler.
      const stack = handlersRef.current
      const top = stack[stack.length - 1]
      if (top) {
        top()
        return
      }
      // Nothing to close → ask before quitting.
      setConfirmingQuit(true)
    }).then(handle => {
      if (cancelled) handle.remove()
      else sub = handle
    })

    return () => {
      cancelled = true
      sub?.remove()
    }
  }, [])

  return (
    <BackButtonContext.Provider value={{ register }}>
      {children}
      {confirmingQuit && (
        <QuitConfirm
          onCancel={() => setConfirmingQuit(false)}
          onConfirm={() => { setConfirmingQuit(false); CapacitorApp.exitApp() }}
          texts={{
            title:   t('app.quitTitle'),
            body:    t('app.quitBody'),
            cancel:  t('app.cancel'),
            confirm: t('app.quit'),
          }}
        />
      )}
    </BackButtonContext.Provider>
  )
}

/**
 * Register a close callback while `open` is true. While registered, the
 * Android back button calls onClose instead of exiting the app. Most-recently-
 * registered handler runs first (stack semantics), so nested modals work.
 */
export function useBackButtonClose(open: boolean, onClose: () => void) {
  const { register } = useContext(BackButtonContext)
  // Stash onClose in a ref so the registration doesn't bounce on every render.
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose }, [onClose])

  useEffect(() => {
    if (!open) return
    return register(() => onCloseRef.current())
  }, [open, register])
}

function QuitConfirm({
  onCancel, onConfirm, texts,
}: {
  onCancel: () => void
  onConfirm: () => void
  texts: { title: string; body: string; cancel: string; confirm: string }
}) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm p-5 animate-scale-in">
        <h2 className="text-lg font-semibold mb-1">{texts.title}</h2>
        <p className="text-sm text-muted-foreground mb-5">{texts.body}</p>
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium rounded-xl border border-border hover:bg-muted transition-colors"
          >
            {texts.cancel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-4 py-2 text-sm font-medium bg-destructive text-destructive-foreground rounded-xl hover:bg-destructive/90 transition-colors"
          >
            {texts.confirm}
          </button>
        </div>
      </div>
    </div>
  )
}

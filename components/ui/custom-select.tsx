'use client'

import { useEffect, useRef, useState, useLayoutEffect } from 'react'
import { ChevronDown, Check, Crown } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface CustomSelectOption<T extends string = string> {
  value: T
  label: string
  // Render an indigo Crown icon alongside the label to signal that this option
  // is a Pro feature. Visual only — the caller is still responsible for gating
  // the actual onChange behavior.
  pro?: boolean
}

interface CustomSelectProps<T extends string = string> {
  value: T
  options: readonly CustomSelectOption<T>[]
  onChange: (value: T) => void
  className?: string
  buttonClassName?: string
  ariaLabel?: string
  placeholder?: string
}

export function CustomSelect<T extends string = string>({
  value, options, onChange, className, buttonClassName, ariaLabel, placeholder,
}: CustomSelectProps<T>) {
  const [open, setOpen] = useState(false)
  const [pos, setPos]   = useState<{ top: number; left: number; width: number; openUpward: boolean } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const selected = options.find(o => o.value === value)

  // Position the popover under (or above) the trigger, anchored to the viewport
  useLayoutEffect(() => {
    if (!open || !btnRef.current) return
    const rect = btnRef.current.getBoundingClientRect()
    const estimatedMenuHeight = Math.min(options.length * 36 + 8, 280)
    const spaceBelow = window.innerHeight - rect.bottom
    const openUpward = spaceBelow < estimatedMenuHeight + 12 && rect.top > estimatedMenuHeight + 12
    setPos({
      top: openUpward ? rect.top - 4 : rect.bottom + 4,
      left: rect.left,
      width: rect.width,
      openUpward,
    })
  }, [open, options.length])

  // Close on outside click / Escape
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (btnRef.current?.contains(e.target as Node)) return
      if (menuRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    const onResize = () => setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', onResize)
    window.addEventListener('scroll', onResize, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('scroll', onResize, true)
    }
  }, [open])

  return (
    <div className={cn('relative', className)}>
      <button
        ref={btnRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        className={cn(
          'w-full flex items-center justify-between gap-2 rounded-xl border border-input bg-background px-3 py-2 text-sm font-sans outline-none focus:ring-2 focus:ring-ring hover:bg-muted/40 transition-colors cursor-pointer',
          buttonClassName,
        )}
      >
        <span className={cn('truncate text-left flex items-center gap-1.5', !selected && 'text-muted-foreground')}>
          <span className="truncate">{selected?.label ?? placeholder ?? ''}</span>
          {selected?.pro && <Crown className="w-3 h-3 shrink-0 text-indigo-500" />}
        </span>
        <ChevronDown className={cn('w-4 h-4 text-muted-foreground shrink-0 transition-transform', open && 'rotate-180')} />
      </button>

      {open && pos && (
        <div
          ref={menuRef}
          role="listbox"
          className="fixed z-[100] rounded-xl border border-border bg-popover shadow-lg py-1 max-h-72 overflow-y-auto font-sans text-sm animate-in fade-in-0 zoom-in-95"
          style={{
            top:  pos.openUpward ? undefined : pos.top,
            left: pos.left,
            minWidth: pos.width,
            ...(pos.openUpward ? { bottom: window.innerHeight - pos.top } : {}),
          }}
        >
          {options.map(opt => {
            const isSelected = opt.value === value
            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => { onChange(opt.value); setOpen(false) }}
                className={cn(
                  'w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted transition-colors',
                  isSelected && 'bg-primary/10 text-primary font-medium',
                )}
              >
                <span className="truncate flex items-center gap-1.5">
                  <span className="truncate">{opt.label}</span>
                  {opt.pro && <Crown className="w-3 h-3 shrink-0 text-indigo-500" />}
                </span>
                {isSelected && <Check className="w-3.5 h-3.5 shrink-0" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

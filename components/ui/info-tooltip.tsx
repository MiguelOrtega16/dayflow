'use client'

import { useState } from 'react'

export function InfoTooltip({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-5 h-5 rounded-full bg-muted text-muted-foreground text-[10px] font-bold flex items-center justify-center hover:bg-primary/10 hover:text-primary transition-colors shrink-0"
      >?</button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-6 z-50 w-64 bg-popover border border-border rounded-xl shadow-lg p-3 text-xs text-muted-foreground leading-relaxed">
            {text}
            <button
              onClick={() => setOpen(false)}
              className="block mt-2 text-primary font-medium hover:underline"
            >Cerrar</button>
          </div>
        </>
      )}
    </div>
  )
}

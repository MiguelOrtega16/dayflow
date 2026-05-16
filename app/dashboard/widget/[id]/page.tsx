'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Plus, RefreshCcw, Settings, Check } from 'lucide-react'
import { WidgetBridge, isWidgetSupported } from '@/lib/widget-bridge'
import { cn } from '@/lib/utils'

const COLOR_SWATCHES = [
  '#7C6FE3', // brand purple (default)
  '#3B82F6', // blue
  '#10B981', // emerald
  '#F59E0B', // amber
  '#EF4444', // red
  '#EC4899', // pink
  '#0EA5E9', // sky
  '#111827', // near-black
]

export default function WidgetConfigPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const widgetId = Number(params?.id)

  const [color,   setColor]   = useState('#7C6FE3')
  const [opacity, setOpacity] = useState(95)
  const [saving,  setSaving]  = useState(false)
  const [saved,   setSaved]   = useState(false)

  useEffect(() => {
    if (Number.isNaN(widgetId)) return
    WidgetBridge.readConfig(widgetId).then(cfg => {
      setColor(cfg.color)
      setOpacity(cfg.opacity)
    })
  }, [widgetId])

  const handleSave = async () => {
    if (Number.isNaN(widgetId)) return
    setSaving(true)
    try {
      await WidgetBridge.writeConfig(widgetId, { color, opacity })
      setSaved(true)
      setTimeout(() => setSaved(false), 1800)
    } finally {
      setSaving(false)
    }
  }

  if (Number.isNaN(widgetId)) {
    return (
      <div className="p-8 text-sm text-muted-foreground">
        ID de widget inválido.
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-background">
      <header className="sticky top-0 z-10 bg-card/80 backdrop-blur-sm border-b border-border px-4 h-14 flex items-center gap-3 shrink-0">
        <button
          onClick={() => router.back()}
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Volver"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h1 className="text-lg font-semibold">Personalizar widget</h1>
      </header>

      <div className="p-4 space-y-6 max-w-md mx-auto w-full">
        {/* Live preview */}
        <div className="rounded-2xl overflow-hidden border border-border shadow-sm" style={{ backgroundColor: `rgba(255,255,255,${opacity / 100})` }}>
          <div className="px-3 h-10 flex items-center justify-between text-white text-sm font-bold" style={{ backgroundColor: color }}>
            <span>All Tasks</span>
            <div className="flex items-center gap-2 opacity-90">
              <Plus className="w-4 h-4" />
              <RefreshCcw className="w-4 h-4" />
              <Settings className="w-4 h-4" />
            </div>
          </div>
          <div className="px-3 py-3 space-y-2 text-xs">
            <p className="text-[10px] font-bold text-muted-foreground">TODAY</p>
            <PreviewRow label="Revisar PRs" time="9:00 AM" />
            <PreviewRow label="Llamar a Ana" time="11:30 AM" />
            <PreviewRow label="Café matutino" time="8:00 AM" done />
          </div>
        </div>

        {/* Color */}
        <div>
          <h3 className="text-sm font-semibold mb-3">Color del encabezado</h3>
          <div className="grid grid-cols-8 gap-2">
            {COLOR_SWATCHES.map(c => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={cn(
                  'aspect-square rounded-xl border-2 transition-all flex items-center justify-center',
                  color === c ? 'border-foreground scale-105' : 'border-transparent hover:scale-105'
                )}
                style={{ backgroundColor: c }}
                aria-label={`Color ${c}`}
              >
                {color === c && <Check className="w-4 h-4 text-white drop-shadow" />}
              </button>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <label className="text-xs text-muted-foreground">Personalizado:</label>
            <input
              type="color"
              value={color}
              onChange={e => setColor(e.target.value)}
              className="w-10 h-8 rounded-md border border-input bg-background cursor-pointer"
            />
            <input
              type="text"
              value={color}
              onChange={e => setColor(e.target.value)}
              className="flex-1 text-xs font-mono rounded-md border border-input bg-background px-2 py-1.5 outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>

        {/* Opacity */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold">Opacidad</h3>
            <span className="text-xs text-muted-foreground font-mono">{opacity}%</span>
          </div>
          <input
            type="range"
            min={20}
            max={100}
            value={opacity}
            onChange={e => setOpacity(Number(e.target.value))}
            className="w-full accent-primary"
          />
        </div>

        {/* Save */}
        <div className="pt-4">
          <button
            onClick={handleSave}
            disabled={saving || !isWidgetSupported()}
            className={cn(
              'w-full py-3 rounded-full bg-primary text-primary-foreground font-bold tracking-wider transition-all',
              saving ? 'opacity-60' : 'hover:bg-primary/90',
              'disabled:opacity-50'
            )}
          >
            {saving ? 'Guardando…' : saved ? '✓ Guardado' : 'GUARDAR'}
          </button>
          {!isWidgetSupported() && (
            <p className="text-[11px] text-muted-foreground text-center mt-2">
              La personalización solo se aplica al widget en la app móvil de Android.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function PreviewRow({ label, time, done }: { label: string; time: string; done?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className={cn(
        'w-4 h-4 rounded-full border',
        done ? 'bg-emerald-500 border-emerald-500' : 'border-muted-foreground/40'
      )} />
      <span className={cn('flex-1 truncate text-sm', done && 'line-through text-muted-foreground')}>{label}</span>
      <span className="text-[10px] text-muted-foreground">{time}</span>
    </div>
  )
}

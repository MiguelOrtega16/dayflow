'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Plus, Settings, RefreshCcw } from 'lucide-react'
import { WidgetBridge, isWidgetSupported } from '@/lib/widget-bridge'

const WIDGET_TYPES = [
  {
    id:    'today',
    name:  'Hoy y próximos',
    size:  '4 × 3',
    bullets: [
      'Tareas de hoy y próximos días',
      'Tareas completadas del día',
      'Marca como completado tocando el círculo',
      'Refresca y personaliza desde la propia widget',
    ],
  },
] as const

export default function WidgetsPage() {
  const router = useRouter()
  const [installedIds, setInstalledIds] = useState<number[]>([])
  const [pinning, setPinning] = useState(false)
  const [statusMsg, setStatusMsg] = useState<{ title: string; body: string } | null>(null)
  const supported = isWidgetSupported()

  const toast = ({ title, description }: { title: string; description?: string }) =>
    setStatusMsg({ title, body: description ?? '' })

  const refreshIds = async () => {
    const ids = await WidgetBridge.listWidgetIds()
    setInstalledIds(ids)
  }

  useEffect(() => { refreshIds() }, [])

  const handleAdd = async () => {
    if (!supported) {
      toast({ title: 'Solo en la app móvil', description: 'Los widgets se instalan desde la app de Android.' })
      return
    }
    setPinning(true)
    try {
      const res = await WidgetBridge.requestPin()
      if (!res.supported) {
        toast({
          title: 'Añade el widget desde el launcher',
          description: 'Tu launcher no soporta añadir widgets desde apps. Mantén pulsada la pantalla de inicio → Widgets → DayFlow.',
        })
      } else if (!res.requested) {
        toast({ title: 'No se pudo iniciar', description: 'Intenta añadirlo desde el menú de widgets del launcher.' })
      } else {
        toast({ title: '¡Listo!', description: 'Selecciona dónde colocarlo en tu pantalla.' })
        setTimeout(refreshIds, 1500)
      }
    } finally {
      setPinning(false)
    }
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-card/80 backdrop-blur-sm border-b border-border px-4 h-14 flex items-center gap-3 shrink-0">
        <button
          onClick={() => router.back()}
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Volver"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h1 className="text-lg font-semibold">Widgets</h1>
      </header>

      {/* Helper banner */}
      <div className="mx-3 mt-3 rounded-xl bg-primary/10 text-foreground/80 text-sm px-4 py-3">
        Pulsa <span className="font-semibold">AÑADIR</span> para colocar el widget en tu pantalla de inicio.
        Es la forma más rápida de ver y completar tus tareas de hoy sin abrir la app.
      </div>

      {statusMsg && (
        <div className="mx-3 mt-3 rounded-xl bg-card border border-border text-sm px-4 py-3 flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold">{statusMsg.title}</p>
            {statusMsg.body && <p className="text-xs text-muted-foreground mt-0.5">{statusMsg.body}</p>}
          </div>
          <button onClick={() => setStatusMsg(null)} className="text-xs text-muted-foreground hover:text-foreground">✕</button>
        </div>
      )}

      {/* Widget catalogue */}
      <div className="p-3 space-y-3">
        {WIDGET_TYPES.map(w => (
          <div key={w.id} className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="min-w-0">
                <h2 className="text-base font-semibold">{w.name}</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Tamaño: {w.size}</p>
              </div>
              <button
                onClick={handleAdd}
                disabled={pinning}
                className="shrink-0 px-4 py-1.5 rounded-full border-2 border-primary text-primary text-sm font-bold tracking-wider hover:bg-primary hover:text-primary-foreground transition-colors disabled:opacity-50"
              >
                {pinning ? '...' : 'AÑADIR'}
              </button>
            </div>

            {/* Mock preview */}
            <WidgetPreview />

            {/* Features */}
            <ul className="mt-3 space-y-1.5">
              {w.bullets.map(b => (
                <li key={b} className="text-xs text-muted-foreground flex items-start gap-2">
                  <span className="text-primary mt-0.5">•</span>
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Already-installed widgets */}
      {installedIds.length > 0 && (
        <div className="px-3 pb-6">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1 mb-2">
            Widgets activos
          </h3>
          <div className="rounded-xl border border-border bg-card divide-y divide-border">
            {installedIds.map(id => (
              <button
                key={id}
                onClick={() => router.push(`/dashboard/widget/${id}`)}
                className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/40 transition-colors"
              >
                <div>
                  <p className="text-sm font-medium">Widget #{id}</p>
                  <p className="text-xs text-muted-foreground">Personalizar color y opacidad</p>
                </div>
                <Settings className="w-4 h-4 text-muted-foreground" />
              </button>
            ))}
          </div>
        </div>
      )}

      {!supported && (
        <p className="text-xs text-muted-foreground text-center px-6 py-4">
          Los widgets solo están disponibles dentro de la app móvil de Android.
        </p>
      )}
    </div>
  )
}

function WidgetPreview() {
  return (
    <div className="rounded-2xl overflow-hidden border border-border/60 bg-background shadow-sm">
      <div className="bg-primary text-primary-foreground px-3 h-9 flex items-center justify-between text-xs font-bold">
        <span>All Tasks</span>
        <div className="flex items-center gap-1.5 opacity-90">
          <Plus className="w-3.5 h-3.5" />
          <RefreshCcw className="w-3.5 h-3.5" />
          <Settings className="w-3.5 h-3.5" />
        </div>
      </div>
      <div className="px-3 py-2.5 space-y-1.5 text-xs">
        <p className="text-[10px] font-bold text-muted-foreground">TODAY</p>
        <PreviewRow label="Revisar PRs" time="9:00 AM" />
        <PreviewRow label="Llamar a Ana" time="11:30 AM" />
        <p className="text-[10px] font-bold text-muted-foreground pt-1">FUTURE</p>
        <PreviewRow label="Reunión mensual" time="20-05" />
        <p className="text-[10px] font-bold text-muted-foreground pt-1">COMPLETED</p>
        <PreviewRow label="Café matutino" time="8:00 AM" done />
      </div>
    </div>
  )
}

function PreviewRow({ label, time, done }: { label: string; time: string; done?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div className={`w-3.5 h-3.5 rounded-full border ${done ? 'bg-emerald-500 border-emerald-500' : 'border-muted-foreground/40'}`} />
      <span className={`flex-1 truncate ${done ? 'line-through text-muted-foreground' : ''}`}>{label}</span>
      <span className="text-[10px] text-muted-foreground">{time}</span>
    </div>
  )
}

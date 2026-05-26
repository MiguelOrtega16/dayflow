'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Plus, RefreshCcw, Settings, Check, Crown, Lock } from 'lucide-react'
import { WidgetBridge, isWidgetSupported, type WidgetKind } from '@/lib/widget-bridge'
import { cn } from '@/lib/utils'
import { useI18n } from '@/lib/i18n'
import { useEntitlement } from '@/lib/billing/use-entitlement'
import { usePaywall } from '@/components/paywall/paywall-provider'
import { createClient } from '@/lib/supabase/client'

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

// Body swatches lean toward neutral surfaces — picking a vibrant body
// makes the dark row text illegible. The user can still type any hex via
// the colour input if they want something off-palette.
const BODY_SWATCHES = [
  '#FAFAFA', // off-white (default)
  '#FFFFFF', // pure white
  '#F3F4F6', // cool grey 100
  '#FEF3C7', // soft amber tint
  '#DBEAFE', // soft blue tint
  '#DCFCE7', // soft green tint
  '#FCE7F3', // soft pink tint
  '#E5E7EB', // cool grey 200
]

/** Widget kinds whose layout has a distinct header + body split — Today,
 *  Day and Agenda. Streak and NextUp are single-tone strips with no
 *  separable body surface to recolor. */
const KINDS_WITH_BODY: Array<WidgetKind | null> = ['today', 'day', 'agenda']

export default function WidgetConfigPage() {
  const { t } = useI18n()
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const widgetId = Number(params?.id)
  const { open: openPaywall } = usePaywall()

  const [color,     setColor]     = useState('#7C6FE3')
  const [bodyColor, setBodyColor] = useState('#FAFAFA')
  const [opacity,   setOpacity]   = useState(95)
  const [saving,    setSaving]    = useState(false)
  const [saved,     setSaved]     = useState(false)
  // Pro entitlement is loaded async. We need both the user id and the
  // widget kind to decide whether to lock this page — the kind isn't in
  // the URL (only the numeric id), so we look it up via WidgetBridge.
  const [userId, setUserId] = useState<string | null>(null)
  const [widgetKind, setWidgetKind] = useState<WidgetKind | null>(null)
  const [kindResolved, setKindResolved] = useState(false)
  const { entitlement, loading: entLoading } = useEntitlement(userId)

  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null))
  }, [])

  useEffect(() => {
    if (Number.isNaN(widgetId)) return
    WidgetBridge.readConfig(widgetId).then(cfg => {
      setColor(cfg.color)
      setOpacity(cfg.opacity)
      if (cfg.bodyColor) setBodyColor(cfg.bodyColor)
    })
  }, [widgetId])

  // Resolve which provider kind this widgetId belongs to. Needed for the
  // soft-revert lock — bookmarking /dashboard/widget/<id> for a Pro widget
  // would otherwise let a downgraded user keep customizing it.
  useEffect(() => {
    if (Number.isNaN(widgetId)) { setKindResolved(true); return }
    let cancelled = false
    Promise.all([
      WidgetBridge.listWidgetIds('today'),
      WidgetBridge.listWidgetIds('streak'),
      WidgetBridge.listWidgetIds('nextup'),
      WidgetBridge.listWidgetIds('day'),
      WidgetBridge.listWidgetIds('agenda'),
    ]).then(([today, streak, nextup, day, agenda]) => {
      if (cancelled) return
      if      (streak.includes(widgetId)) setWidgetKind('streak')
      else if (nextup.includes(widgetId)) setWidgetKind('nextup')
      else if (day.includes(widgetId))    setWidgetKind('day')
      else if (agenda.includes(widgetId)) setWidgetKind('agenda')
      else if (today.includes(widgetId))  setWidgetKind('today')
      setKindResolved(true)
    })
    return () => { cancelled = true }
  }, [widgetId])

  // Streak + NextUp customization is Pro; Today stays free to customize
  // (long-standing UX — the Today widget has always shipped with full
  // color + opacity control as the entry-point widget). Wait for the
  // entitlement fetch before showing the lock so an active Pro user
  // doesn't see a Pro-gated flash.
  const isProWidget = widgetKind === 'streak' || widgetKind === 'nextup'
  const locked = kindResolved && !entLoading && isProWidget && !entitlement.isPro

  const handleSave = async () => {
    if (Number.isNaN(widgetId)) return
    setSaving(true)
    try {
      await WidgetBridge.writeConfig(widgetId, { color, bodyColor, opacity })
      setSaved(true)
      // Let the user see the "Saved" confirmation briefly, then return to
      // the widgets list — they're done with this screen.
      setTimeout(() => router.push('/dashboard/widgets'), 900)
    } finally {
      setSaving(false)
    }
  }

  // Streak/NextUp have no body surface to recolor — keep the picker
  // hidden for those kinds so the UI doesn't promise something the
  // widget can't render.
  const showBodyPicker = KINDS_WITH_BODY.includes(widgetKind)

  if (Number.isNaN(widgetId)) {
    return (
      <div className="p-8 text-sm text-muted-foreground">
        {t('widgetConfig.invalidId')}
      </div>
    )
  }

  if (locked) {
    return (
      <div className="flex flex-col h-full overflow-y-auto bg-background">
        <header className="sticky top-0 z-10 bg-card/80 backdrop-blur-sm border-b border-border px-4 h-14 flex items-center gap-3 shrink-0">
          <button
            onClick={() => router.back()}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            aria-label={t('widgetConfig.back')}
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h1 className="text-lg font-semibold">{t('widgetConfig.title')}</h1>
        </header>
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-sm w-full rounded-2xl border border-border bg-card p-6 text-center">
            <div className="w-12 h-12 rounded-full bg-indigo-500/10 text-indigo-500 mx-auto flex items-center justify-center mb-3">
              <Crown className="w-6 h-6" />
            </div>
            <h2 className="text-base font-semibold mb-1">{t('widgetConfig.proLockedTitle')}</h2>
            <p className="text-sm text-muted-foreground mb-5">{t('widgetConfig.proLockedBody')}</p>
            <button
              onClick={() => openPaywall('locked_widget')}
              className="w-full py-2.5 rounded-full bg-primary text-primary-foreground font-bold tracking-wider hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
            >
              <Lock className="w-3.5 h-3.5" />
              {t('widgetConfig.proLockedCta')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-background">
      <header className="sticky top-0 z-10 bg-card/80 backdrop-blur-sm border-b border-border px-4 h-14 flex items-center gap-3 shrink-0">
        <button
          onClick={() => router.back()}
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          aria-label={t('widgetConfig.back')}
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h1 className="text-lg font-semibold">{t('widgetConfig.title')}</h1>
      </header>

      <div className="p-4 space-y-6 max-w-md mx-auto w-full">
        <div
          className="rounded-2xl overflow-hidden border border-border shadow-sm"
          style={{ backgroundColor: bodyColorWithOpacity(bodyColor, opacity) }}
        >
          <div className="px-3 h-10 flex items-center justify-between text-white text-sm font-bold" style={{ backgroundColor: color }}>
            <span>{t('widgets.title')}</span>
            <div className="flex items-center gap-2 opacity-90">
              <Plus className="w-4 h-4" />
              <RefreshCcw className="w-4 h-4" />
              <Settings className="w-4 h-4" />
            </div>
          </div>
          <div className="px-3 py-3 space-y-2 text-xs text-[#1A1A1A]">
            <p className="text-[10px] font-bold text-[#666666]">{t('widgets.preview.today')}</p>
            <PreviewRow label={t('widgets.preview.sample1')} time="9:00 AM" />
            <PreviewRow label={t('widgets.preview.sample2')} time="11:30 AM" />
            <PreviewRow label={t('widgets.preview.sample4')} time="8:00 AM" done />
          </div>
        </div>

        <div>
          <h3 className="text-sm font-semibold mb-3">{t('widgetConfig.headerColor')}</h3>
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
                aria-label={t('widgetConfig.colorAria', { color: c })}
              >
                {color === c && <Check className="w-4 h-4 text-white drop-shadow" />}
              </button>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <label className="text-xs text-muted-foreground">{t('widgetConfig.custom')}</label>
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

        {showBodyPicker && (
          <div>
            <h3 className="text-sm font-semibold mb-3">{t('widgetConfig.bodyColor')}</h3>
            <div className="grid grid-cols-8 gap-2">
              {BODY_SWATCHES.map(c => (
                <button
                  key={c}
                  onClick={() => setBodyColor(c)}
                  className={cn(
                    'aspect-square rounded-xl border-2 transition-all flex items-center justify-center',
                    bodyColor === c ? 'border-foreground scale-105' : 'border-input hover:scale-105'
                  )}
                  style={{ backgroundColor: c }}
                  aria-label={t('widgetConfig.colorAria', { color: c })}
                >
                  {bodyColor === c && <Check className="w-4 h-4 text-foreground drop-shadow" />}
                </button>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-2">
              <label className="text-xs text-muted-foreground">{t('widgetConfig.custom')}</label>
              <input
                type="color"
                value={bodyColor}
                onChange={e => setBodyColor(e.target.value)}
                className="w-10 h-8 rounded-md border border-input bg-background cursor-pointer"
              />
              <input
                type="text"
                value={bodyColor}
                onChange={e => setBodyColor(e.target.value)}
                className="flex-1 text-xs font-mono rounded-md border border-input bg-background px-2 py-1.5 outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold">{t('widgetConfig.opacity')}</h3>
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
            {saving ? t('widgetConfig.saving') : saved ? t('widgetConfig.saved') : t('widgetConfig.save')}
          </button>
          {!isWidgetSupported() && (
            <p className="text-[11px] text-muted-foreground text-center mt-2">
              {t('widgetConfig.androidOnly')}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

/** Converts a "#rrggbb" + 0..100 opacity into an rgba() string for the
 *  preview tile. Returns the hex unchanged if it isn't a valid 6-digit
 *  colour (the colour input can be in flux while the user types). */
function bodyColorWithOpacity(hex: string, opacityPct: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex)
  if (!m) return hex
  const n = parseInt(m[1], 16)
  const r = (n >> 16) & 0xff
  const g = (n >>  8) & 0xff
  const b =  n        & 0xff
  return `rgba(${r}, ${g}, ${b}, ${opacityPct / 100})`
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
